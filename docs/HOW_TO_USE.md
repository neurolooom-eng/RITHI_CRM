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

**The search box at the top searches everything you can open.** Screen names
first; then, from three characters, calls (UCN, call number, party, serial,
product), pending call requests (REQID), spare requests (UID, OR number, UCN,
part), spares consumed, parties, machines, parts, documents (manuals, technical
notes, QMS), Field Solutions articles, Field Failure Reports, warranties (SA
number, party, invoice, or the serial / model of a machine on it) and contracts
(MC number, party, or a machine's serial / model) — up to five of
each. Where there are more than five, the group says so: type more of the name
or number, or open that register to see them all. **Click one and that record opens** on its own screen: a call opens in its
view, a machine in Machine History, a document in Drive, a warranty or contract in
its register, searched to that entry. ↑ ↓ and Enter work
too. It only ever shows records you could already open on that screen.

**Quality records are never deleted.** A wrong spare line is **voided** — the
quantity goes to zero, the row stays with its original quantity, reason and
author, and the stock returns. A failure report is cancelled or withdrawn.

**Every download can go to a Google Sheet.** Press any Export / Download button
and you are asked where it goes: **⭳ Download** saves the CSV or Excel file to
this device, as before; **Save as Google Sheet** writes the same rows into a
Google Sheet in **your own folder** inside the RITHI export folder on Google
Drive. Your folder is made on your first export (named with your name and email)
and every later export goes into that same folder. The sheet is named after the
export with the date and time, numbers and dates stay numbers and dates, and a
code beginning with 0 keeps its 0. When it is saved you get a link to open it; if
it cannot be saved you are told why and can download the file instead. Each save
is recorded in the Audit Log.

**You see what your role allows.** Two people can open the same screen and see
different totals. An empty register usually means access, not emptiness.

---

## Overview & search

- **Dashboard** `/` — what is open, what is overdue, what needs you.
- **Product & Party Search** `/lookup` — find a machine or customer and see
  everything about it. The party list comes from the machines on record, so every
  customer offered has something to find.
  > **It searches the copies of the machine register and the Party Master kept
  > on your device** (every column of both), so it
  > works with a weak or no signal. The machine copy is a **snapshot of the
  > Product Database as stored** — the contract, status and engineer each machine
  > carries — not worked out again while it downloads. It is refreshed every six
  > hours and when the signal returns; the **Party Master** copy (and the
  > Standard Complaints) only once in ten days, since they change rarely — an
  > edit on this device refreshes them at once. The line under the title says how
  > many machines it holds and when it was downloaded. A machine added in the last few hours: press
  > **Download again** there (or ↻ Refresh on the Product Database screen).
  > **🧹 Clear Cache and Update does not re-download it**, and neither does
  > **⟳ Update now** on the new-version banner — updating the app and refreshing
  > the data are separate on purpose, so a new release costs nobody a download.
- **Spare Insights** `/spare-insights` — consumption over a window, five ways.
  Both ends of the window count; voided lines do not; an uncategorised part shows
  as Unclassified rather than guessed at.

## Requests & registration

- **Request Registration** `/request-registration` — **the machine names the
  customer**: search the serial first and the customer follows. An installation is
  the exception, since the machine may not exist yet.
  > Product, serial and the customer's details all come from the copies kept on
  > your device first, and from the server only for something the device does
  > not have yet — so the form works on a weak signal.
  > **The Installation Report and KYC open with a click** — the columns (and a
  > request's details) show **📎 Open**, which opens the stored file in a new tab.
  > **Mapped to the wrong call?** Open the request and press **↩ Unmap** — the UCN is
  > cleared and it goes back on the Pending list. The call itself is not changed.
- **Pending Registrations** `/pending-registrations` — the Hotline queue.
  Registering one issues the UCN and files the call. The chips at the top filter
  it by Call Type, each with its count.
  > The call is filed to the Hotline desk, but the system separately records *who
  > actually typed it in*. The two differing is a finding, not an error.

## The call registers

- **Field Call Register** `/field-calls` — breakdown calls.
- **Installation Calls** `/installations` — new machines going in.
  > Under the choice the report shows the machine's warranty **now** and where it
  > will **start and end after this report**. Every installation's choice, solved
  > date and resulting warranty are kept in the **installation warranty record**.
  > **Warranty Start Date?** on the installation report is a choice, not a date:
  > **Installation Call Solved Date** — the machine's warranty in the Product
  > Database then starts the day this call is solved and ends a warranty period
  > later — or **Invoice Date**, which keeps the start on the PO / Warranty Sale
  > Entry. Nothing is pre-selected; the engineer must choose.
- **Preventive (PM)** `/pm-calls` — planned maintenance.
  > **Listed newest Call Registration Date first** — not in the order a PM
  > month was uploaded, so a back-dated call sits where its date puts it.
  > Click a column heading to sort by something else.
  > **Update Party Details / Update Product Details** (all three registers, on a
  > call of any status — in the Call View, or tick calls and use the bar):
  > **Party** sets City and State from the Party Master (a party the master
  > does not hold is left as it was). **Product** sets Warranty No, Warranty
  > Start and End, Contract No, Start, End and Type, and Item Status **as on the
  > call's registration date** — the warranty and contract running that day;
  > if none was, the last ones that had ended, with Item Status OGP; if both
  > were, WGP. Needs the edit rights for the call's customer section. **Hidden
  > while Audit Mode is ON.** In the Call View each sits in its own section's
  > header — Party in *Customer & Product*, Product in *Warranty & Contract*;
  > for many calls, tick them and use the bar.
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
restored); that deletes nothing. **Only an Unattended or Unsolved call can be
cancelled** — a call that was visited and closed, or re-opened, cannot, because
cancelling it would take what was done out of every count. The database refuses
it too, not just the button. There is no closing a call without a visit: enter
the visit that happened, or cancel a call that should not have been raised.
**You can cancel, restore, re-open or close only a call you can see** — your
own, your team's, or every call if your role sees everything. A right ticked
on Roles & Permissions does not reach another team's calls.

## Getting data in

- **Bulk Uploads** `/bulk-uploads` — **this is the importer.** It finds the
  heading row even under a letterhead, reads tab-separated files, and lists what
  it kept and what it held back. Unrecognised columns are **kept on the row**
  where the register allows it.
  > **Installation Warranty Start (old installation calls)** loads past
  > installations — back to 2018 — one row per installation call, matched on the
  > UCN. Each row's *Warranty Start Date?* (Installation Call Solved Date or
  > Invoice Date) and call solved date decide that product + serial's warranty in
  > the Product Database exactly as a report filed today does; the resulting start
  > and end are worked out by the system and shown on the row, not loaded.
- **Device Cache Status** `/device-cache` — which phones and laptops hold the
  machine register and Party Master for offline search: one row per person per
  device, how many machines, customers, Standard Complaints and **parts** (the
  Part Master the spare pickers use) it holds, when each was downloaded and
  the last failure. The parts are kept on the device and refreshed every six
  hours, so a Spare Request can pick a part with no signal (Spare Requests shows when
  the list was cached on your device, with **Download now** to fetch a fresh
  copy at once). Everybody is listed, including whoever has **never
  reported** — the engineer worth chasing before they travel. A device reports
  after each download and on sign-out, so one switched off shows its **last
  report**; read *Last reported*. Administrators and Technical Support to begin
  with; grant `Device Cache Status` on Roles & Permissions for anyone else.
- **Data Export** `/data-export` — tick the tables you want and download them as
  one ZIP with a CSV per table. **The export runs as you** — it holds exactly the
  rows you are entitled to see, which is what makes it safe to have on a menu.
  The audit trails are deliberately not offered. Row counts beside each table are
  the database's own **estimates**, so they say "approx." rather than pretending
  to be exact.
  Every table carries five **system columns** — `sys_id`, `sys_created_by`,
  `sys_created_on`, `sys_updated_by`, `sys_updated_on` — which the database fills
  on every save from whoever was signed in. They are separate from the table's
  own "created"/"updated" fields and never replace them. `sys_created_by` and
  `sys_updated_by` are login ids. Rows that existed before these columns were
  added were filled from the table's own fields where it had them, and are empty
  where it never recorded one.

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
  their calls, and turns the AppSheet references already in the register into
  Drive links.

  > ### The report is a string, not a link — turning it into one
  >
  > Visits loaded through **Bulk Uploads** keep the attachment cell exactly as
  > the file wrote it. AppSheet writes a path (`Reports_Images/Row 42_Photo.png`)
  > or a link back into the app, and neither of those opens anything — so on
  > those calls "open the report" opens a string. **7,538 of the 12,254 visits
  > with a report are like this.**
  >
  > The top card of Bulk Report Mapping fixes them. **Survey the register** to
  > see what is there, counted by shape. Then **Resolve** looks each file name up
  > in Drive, and **Convert** writes the links. You see every row before anything
  > is written.
  >
  > **It runs in passes** — 500 at a time by default. Doing all 7,538 in one go
  > would hold the tab open for a couple of hundred Drive lookups. Stop whenever
  > you like; the next survey shows what is left.
  >
  > **A file Drive cannot find, or finds twice, keeps its reference.** That is
  > deliberate: you can still settle it by hand, which you could not do with a
  > blank cell.
  >
  > **Nothing else on the visit changes** — not the status, not the visit date,
  > not the engineer, not when it was entered. The old reference is kept in
  > **Source Ref**.
  >
  > If your role is shown only your own calls and your team's, the counts say so.
  > They are not a statement about the whole register.

  > ### Filling Visit Date & Time and Visit Entry Date on consumption data
  >
  > **Those two are not fields on the consumption row.** The Consumption Report
  > reads them from the **visit**, so there is nothing on the spare line to
  > type them into and re-uploading the consumption file cannot fill them.
  > When the call has no visit report they fall back to other dates (the
  > booking time last), and only Visit UID stays blank.
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
   > **Complaint and Item Status follow the call.** Change either on the call and
   > every spare request on it changes too, at any stage. To bring an older
   > request in line, open it and press **↻ Update from call**, or tick several
   > in the register and press it once. Lines already past RM approval keep the
   > approval route they were given; only what the request shows changes.
   > **A request on a call with no visit adds the visit.** When the call has no
   > visit yet, saving the request files one: **Unsolved**, the requesting
   > engineer, the request date, pending reason **SPARES NOT AVAILABLE** (the
   > Call Pending Reason list's spelling of it), Update Visit Work Details
   > **No** — and the call reads Unsolved. If the call already has a visit,
   > nothing is added. A HandStock request never adds one.
   > Item Status always reads the call's — it cannot be set to anything else.
   > **Once the RM has approved or rejected a spare, its part and quantity are
   > fixed.** To ask for a different part or more of it, raise a new request.
   > **Moving a request to another engineer is ✎ Change engineer** — it needs its
   > own permission and a reason, and is kept on record. Nothing else moves it.
2. **RM Approval** `/spare-rm-approval` — the queue shows the complaint, machine,
   serial and cover, because "is this part plausible for this fault?" is most of
   the decision. Tick several and approve or reject them at once; a rejection needs a reason.
   A spare is dropped from Spare Requests or Pending Dispatch, not here.
   **A reason is required on every path** — a rejection, a drop, and moving a request
   to another engineer. Nothing is rejected, dropped or moved with the box left empty.
3. Commercial and NSM approve their own stages where the request needs them.
   **Only the words Approved, Auto-Approved or "Cleared for Stores
   Processing" move a spare on.** A spare loaded from a sheet with anything
   else in an approval column — "Not Approved", "Approval Pending" — waits at
   that approver, showing the word as loaded.
4. **Pending Dispatch** `/spare-dispatch` — Stores issues the part and raises the
   Delivery Challan.
   > The **📜 Declaration** that travels with the parcel is signed off in the name
   > of **whoever booked the stock out** — the same person the challan names. It
   > used to print one fixed name on every declaration. Once the stock out is
   > booked that name **cannot be changed** — not by editing it, and not by
   > re-loading the Stock Out Register.
5. The engineer **acknowledges receipt**.
6. **Spare Consumption** `/spare-consumption` — the part is booked against the
   call.
   > **A spare needs a visit report on its call — except a reconciliation.**
   > Spares booked from Call Reporting or the bulk upload are refused on a call
   > with no visit report. **Add consumption (reconciliation)** is for a part
   > fitted but never reported, so it is accepted without one: it still needs
   > the call, the part in that engineer's hand stock, and your reason. Until a
   > visit is filed, the Consumption Report shows the booking time as the visit
   > dates and leaves Visit UID empty; filing the visit later corrects all
   > three. If a save is refused, the reason now shows inside the form, above
   > Save.

- **Stock Out** `/stock-out` — a flat list of what Stores has issued; a different
  question from the dispatch queue, and now grantable separately.
- **Hand Stock** `/handstock` — what an engineer holds. **Worked out, never
  stored**: issued − consumed ± transfers − returns.
  > **Why a booking can be refused.** Consumption is capped at the engineer's
  > balance. If the balance is wrong the Spare Coordinator corrects the stock; the
  > engineer does not book around it.
  > **± Adjust stock** (whoever holds the reconciliation permission): choose the
  > engineer and the part, **Add** or **Remove** a quantity, give the **reason**
  > and the **reference** (the MTN number). It takes effect at once and shows on
  > their movements as an **Adjustment**. It is never edited or deleted — to
  > correct one, record another the other way — and a removal cannot take them
  > below zero. This replaces WinMax's *eBizWiz Admin* account, whose opening
  > stock has been removed.
  > **The cap applies on every route.** Marking a booking, transfer or return
  > as "imported" no longer lets it past the limit — only Bulk Uploads and the
  > Data Import panel load history. Stores cannot lower an issued quantity or
  > remove an opening balance below what the engineer has already used; a
  > correction is a **± Adjust stock**, which is checked and kept.
- **Material Returns (MRN)** `/mrn` — parts back to Stores; the return takes the
  stock off the engineer's balance. Open a return and press **Print MRN** for the
  **Material Return Note R/SER/STR/002** (landscape A4): the engineer and their
  place (City on the User Master, else Region), the MRN number and date, each
  part with Qty. (good + defective), customer, report no, removed from
  equipment, hand stock, and Good / Damaged. It prints only what the return
  holds — **Store Dept. Use**, **Authorized By** and **Received By** are left for
  Stores to write; **Entered By** is whoever keyed the return.
  > **A return is your own stock.** Returning for another engineer needs *Return
  > stock for another engineer* (Stores and the approvers hold it).
- **Stock Transfer** `/stock-transfer` — hand stock between engineers. A transfer
  to the same person is held back and named. Each part can carry a **reason of
  its own** besides the common Remarks. **🖨 MTN** on a transfer prints the
  **Material Transfer Note R/SER/STR/003**: issuer and receiver with their
  places, the MTN No. (the transfer number) and date, each part with its own
  reason or else the common remark, Issued By (the sending engineer and the
  date) and Entered By (who keyed it). **Received By is blank** — RITHI does not
  record the receipt of a transfer — and Authorised By is signed by hand.
  > **A recorded transfer is not re-pointed.** Its engineers and date cannot be
  > changed afterwards; if it went to the wrong person, record a transfer back.

## Quality

- **Daily Complaint Review Register (R/SER/35)** `/daily-review` — the DCCR,
  where every solved call is reviewed. **Review 1** is the vigilance answer
  taken at registration; **Review 2** asks what the failure was; **Review 3**
  classifies it. A review is saved only on a call you can see — so a Field
  Failure Report is never raised in your name on somebody else's call.
  > **Frequent failure has two rules.** **Rule 1** — this machine failing again
  > (same product and serial) within the window. **Rule 2** — the same complaint
  > on **different serial numbers** of one product within 30 days, which is a
  > batch or component problem rather than one unit. It counts serials, not
  > calls, so several visits to one machine stay rule 1's finding. Either rule
  > makes it a frequent failure, and the screen says which. Both are tuned on
  > SLA / Objective Configuration.
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
  - **Auto review is a switch, and a person's.** It can be turned on or off by
    **Admin, NSM and Technical Support** — by role, not by name — and by anybody
    an administrator gives *Switch auto review on or off* on User Master →
    Access. It is the one thing Technical Support can change. The switch is at
    the top of the register, which always shows whether it is on and in whose name.
    While it is on, each morning Review 2 is answered *No* for calls logged
    before that day that failed outside their first year — **in the name of the
    person who switched it on**, and marked as an auto-review answer so Review 3
    can tell it from one given by looking at the call. A call inside its first
    year, or with no age on record, is always left for a person. It starts off.
  - **Old reviews can be loaded in bulk** (Bulk Uploads → DCCR Register): they
    come in as they were — the file's reviewer names and dates, not yours — and
    loading them raises **no** Field Failure Report. Load the old reports
    themselves through the Field Failure Register upload. Re-loading a corrected
    file updates the same calls.
- **Call Review** `/call-review` — a second look at the **report** on a solved
  call. Book a spare the engineer did not record (a **Reconciliation** line,
  visibly a correction), re-open the call, or mark it Report Reviewed.
- **Field Failure Register** `/failure-report` — failures that go back to
  manufacturing, on the controlled form `R-SER-03`, numbered `FFR - 001/26` and
  restarting each year.
  - **A report raises itself** when the Daily Complaint Review Register
    answers any of Risk to Patient, Warranty Failure or Frequent Failure
    as *Yes*. Its **CAPA fields start blank** — responsibility, CAPA No and
    CAPA status are filled in by whoever handles the CAPA, and so are they on a
    report raised with ＋ Raise FFR.
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
  > **Six fields are required on every sale**: Party Name, Invoice No, Invoice
  > Date, Warranty Start Date, Warranty Period (Months) and PM Visits. The entry
  > reads top to bottom as Sale, Warranty, then Party.
  >
  > **Party Name is a search box over the Party Master** — start typing and pick
  > the customer. Choosing one **fills in the Party section**: party type,
  > profile, country, state, city, address, pincode, both telephone numbers,
  > PAN, GST and the initial service engineer, from that customer's record.
  >
  > **Party Name is locked once the sale is saved.** The party's details are
  > not: change any of them on the sale and **Save entry writes the change back
  > to the Party Master** as well, and the message lists what was updated. Only
  > what you changed in that edit goes back — re-saving an old sale does not put
  > its old values over a party corrected since. Writing to the Party Master
  > needs the right to edit parties; without it the sale still saves and the
  > message says the Party Master was not updated.
  >
  > **Changing the customer replaces all of those, blanks included.** That is
  > deliberate: keeping the previous customer's address where the new one has
  > none would put a different hospital's address on the sale with nothing on
  > screen saying so. Type over any of them afterwards — the installation
  > address often differs from the registered one.
  >
  > A customer the Party Master has not got can still be typed. Nothing is
  > filled in for them, because there is nothing to fill it from — and **Party
  > Type, Profile, Country, State, City, Address, Pincode, GST and Service
  > Engineer become required**. Save entry adds the customer to the Party
  > Master from those details (if your role may add parties).
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
  > **A sale to a dealer gets no installation call.** If the sale's Type is
  > **DEALER**, the button is not offered (on the entry or on its Register line)
  > and the machines are not counted as *pending*; the system refuses such a call
  > however it is raised. When the dealer sells the machine, record an
  > **Ownership Transfer** and raise the call from there (see below).
  >
  > **Sold Through** lists **dealers only** — Party Master entries whose Type is
  > DEALER. It records the dealer a machine was sold through.
  >
  > **＋ Installation calls** raises one call per machine that has not got one.
  > Each one carries:
  >
  > | | |
  > |---|---|
  > | Party, city, state | from the sale entry |
  > | Product, serial | from that machine's line |
  > | **Call Number** | `WI-PRODUCT-SERIAL` — e.g. `WI-MONNAL TEO NF-210`. W for warranty, I for installation. This is *beside* the UCN, which the system still issues. |
  > | Standard Complaint · Reported Complaint | **INSTALLATION CALL** |
  > | **Complaint Date · Breakdown Date** | the **warranty start date**. An installation is not a breakdown, so there is no day on which one happened. The machine's own start date wins where it has one; no start date at all leaves both empty rather than putting today on the record. |
  > | **Allotted To** | the **engineer from the Party Master**, which arrives on the sale when you pick the customer. A machine given its own engineer wins over the entry. |
  > | Vigilance (3 questions) | **NO** |
  > | Person calling, customer name, number, designation, email | blank — those record who *reported* a fault, and nobody reported this |
  > | SA number, warranty start/end, item status **WGP** | only where the sale records a warranty; otherwise blank rather than guessed |
  >
  > Each call's UCN lands on that machine's **INST Call** field, and the button
  > goes away once every machine has one.
  >
  > **Save the entry before pressing it.** A machine you have just typed in is
  > not saved yet, so there is nothing for the call's UCN to be written back to
  > — the button skips it and says how many are waiting on a Save. It is a
  > refusal on purpose: raising the call and failing to map it would leave the
  > machine still asking for one, and the next press would raise a second call
  > for the same machine.
  >
  > **A line needs both a Product and a Serial** to be offered a call. A line
  > with neither is not a machine yet, and a call about it would be a call about
  > nothing.
  >
  > Nothing is raised until you confirm, and the confirmation lists every
  > machine by model and serial. If it stops part way it **names the calls it
  > already created** — those exist whatever the message says.
  >
  > ### Or one machine at a time
  >
  > **Register → Register call → ＋ Installation call** does the same thing for
  > the single machine in front of you, which is what you want when you are
  > working down the list rather than opening an entry. Same rules, same
  > function — once it is raised the button is replaced by the **UCN**, which is
  > the evidence it disables itself by.
  >
  > It is offered on the **Warranty** register only. A machine reaches a
  > contract already installed. It is shown to anybody who may create
  > installation calls — Hotline included — and they can write the new call
  > back onto the machine even without the right to edit the register.
  >
  > **INST Call holds a call number or nothing.** The AppSheet export used to
  > fill it with the words "To Check" — where nobody had looked yet, not a call
  > number. Those have been cleared, and where an installation call for that
  > machine already existed, its UCN was written there instead (matched on model
  > *and* serial). A machine with **two** installation calls was left blank and
  > named in the repair log with both numbers, for somebody to pick by hand.
  >
  > **Re-importing the AppSheet cover file cannot put them back**, and cannot
  > wipe a UCN this application wrote — a value that is not a call number is
  > discarded on the way in. One UCN can still replace another; that is
  > somebody correcting a mapping.
  >
  > **＋ Field call** beside it is different: it does not create anything, it
  > opens the Field Call form with the machine and customer already filled in.
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
**Register** (one row per machine, with Active / About to expire / Inactive
tiles — it used to be called *By machine*).
**Clicking a line on the Register tab opens that machine's entry**, in the same
window, with the machine opened and marked on the right.
**On the Warranty Register, the Installation call column reads Pending** for a
machine still waiting for its call ("To Check" counts as pending) and shows the
UCN once one is mapped; the **INSTALL CALL PENDING** tile filters to them,
across the whole register, together with the search and the state tiles.
On the **Entries** tab, **Install calls pending** shows how many of each sale's
machines are still waiting, and **SALES WITH INSTALL CALLS PENDING** filters to
the sales with at least one.
**Clicking an entry opens it in a pop-up window**: the entry's details on the
left, its products on the right, each half scrolling on its own. Every button —
Save entry, Delete entry, Close, + Add machine and Force update child records,
plus Update from Party Master and ＋ Installation calls on a sale and Renew this
contract on a contract — sits in the bar at the top, which stays put however
far you scroll. The window does not close on a click outside it,
and if you close it over unsaved changes it asks first. On a phone the two
halves stack. Each register
opens on **2,000 rows** — two full requests of the 1,000 the database hands over
at once — and every **Load more** fetches twice as much as the one before.
**Load more** sits at the top, beside the count, as on Field Calls; it loads
more of the tab that is open (Entries or Register).
**Adding machines to a contract is picking, not typing.** The contract's Party
Name is searched in the Party Master kept on this device. Once the contract is
saved, **+ Add machine** opens a third column listing every machine the Product
Database shows with that customer — product, serial, code, and the SA Number and
MC Number it carries now (the device's copy first, the server if the copy is not
there). Tick the machines, type each one's **Rate** and **Tax** (the tax is
offered at 18% of the rate and can be changed), and press **Add**; the **Total
After Tax** is the rate plus the tax and is worked out. A machine already on the
contract is shown but cannot be ticked again. **Add a machine that is not
listed** opens a blank card as before. Each machine on the right reads, top to
bottom: Product Details, Price, From the entry (everything it follows from the
contract), and History (the SA Number and earlier MC Number from the Product
Database).
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

**On a new contract** the **Contract Start Date** opens on today — change it if
the contract starts on another day. Type the **Period (Months)**; the years appear under it ("= 1.5 years")
and the **Contract End Date** is worked out from it and cannot be typed, and **PM Visits (Total)** is suggested (you can change it).
**Party Name** is picked from the **Product Database**: type part of the name
and choose — it lists customers who own a machine on record, and a name cannot
be typed in. If the customer is missing, add their machine to the Product
Database first.
> **Four fields must be filled before a contract saves**: **Period (Months)**,
> **PM Visits (Total)**, **Payment Schedule** and **Bill Generate At**. They carry
> a **\***, and the message names every one left blank. Contracts loaded from the old system's files are not refused for
> blanks; the rule is the form's.

**Status** is worked out and cannot be typed: **Active** while the end date is
more than 30 days away, **About to Expire** within 30 days (the end date itself
included), **Contract Expired** once it has passed.

The entry window shows, under its heading, how many machines and customers are
on this device and when they were downloaded — Party Name searches that copy
first, as Call Request does.

**⭳ Export Excel** (both registers, both tabs) gives a workbook whose dates are
real Excel dates — they sort, filter by month and take your own date format.
**⭳ Export CSV** is still there, but a CSV holds only text, so its dates are
written as `dd-MMM-yyyy` text.

**Renew this contract** and **⇢ Convert to Contract** open in a **third column**
beside the details and the products, so the machines being carried over stay in
view.

**⇢ Convert to Contract** (on a saved sale, in the Warranty Register) raises a
contract from it. The **customer** and every **machine with a serial** carry
over, each machine noting its SA Number and warranty end. The contract starts
**the day after the warranty ends**, so cover has no gap. You give the **MC
Number** (the next one is offered), **Contract Type**, **Period (Months)**, **PM
Visits**, **Payment Schedule**, **Bill Generate At** and, if you like, a rate per
machine. It warns if the sale's machines are already on a contract, and opens
the Contract Register on the new one.
**A machine now with a different customer is never offered.** If a machine on
the sale has since been transferred (or sold) to someone else, it is left out of
the list and shown under it as *"Product serial number was transferred to a
different customer"*, with the customer who has it. The check is made again
when you press Create the contract.

**Service Engineer** is picked from the **User Master's active people**, on the
sale and on each machine. If the record names somebody who is not an active user
(often the Party Master's Serviceman, filled in with the customer), it is shown
with a red note to choose an engineer from the list.

**A new customer is added to the Party Master when you save the sale.** Type a
Party Name the master does not have and the sale says so; **City** and **State**
then become required, as they are on the Party Master. Fill in the address,
phones, PAN, GST, Type, Profile and Serviceman as you would on the Party Master,
and **Save entry** adds the party (it gets its Party Key) and saves the sale in
one step. If your role may not add parties, the sale is saved without adding it,
and the message says so.

**Save entry stays grey until something on the entry has changed.**

**Prev MC Number** is not on the contract form: **Renew this contract** fills it
in on the new contract with the number it was renewed from.

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
  - On the Product Database the machine then shows the **new owner's address,
    city, state and Service Engineer**, from their Party Master entry, and keeps
    them when the original sale is saved again. If the new owner's Party Master
    has no address, the machine keeps the one it had.
  - **＋ Record a transfer picks the MACHINE from the Product Database** — type
    part of the serial and choose the line showing serial, model and current
    party (this device's copy first). Choosing it shows **From — the current
    details** (party, address, city, state, Service Engineer), the **Sale
    Entry** (SA Number, Invoice No., Invoice Date, Sold Through) and the **Warranty** (start and end
    date, item status, contract number), all as the Product Database has them,
    and they are kept on the transfer as a record of what the machine carried
    when it changed hands. **To party is picked from the Party Master** on this
    device and shows that party's address, city, state, type and engineer; a
    party that is not on the Party Master must be added there first.
  - **The OT Number is given automatically** when the transfer is saved — the
    next after the highest on file (OT1432 → OT1433). A transfer loaded from a
    file keeps the number the file carries.
  - **Invoice No. and Invoice Date** (optional) for the hand-over: the Product
    Database shows this invoice for the machine, with or without a fresh
    warranty, unless the machine has a sale dated after it.
  - **Files** (optional): attach the papers for the transfer. They go to the
    **Ownership Transfers** folder in Drive and open from the transfers list.
  - **A fresh warranty for the new owner** is optional: tick **Give the new
    owner a fresh warranty**, then enter the **Warranty Start Date** (it starts
    at the transfer date) and the **Warranty Period (in Months)**. The years and
    the **End Date** are worked out, as on Warranty Entry. The transfer's **OT
    Number** becomes the machine's **Warranty Number** on the
    Product Database, which shows the fresh dates and Item Status WGP while they
    run. The original sale entry is not changed. A later sale of the machine
    (one whose warranty starts after this one) takes the warranty back; saving
    the old sale again does not.
  - On a file load, **leave "From Party" blank** and it fills from whoever holds
    the machine now, which is what lets a historical list load in date order.
  - If the previous owner cannot be worked out the hand-over is still recorded
    with that field blank, not dropped.
  - Matched on the OT number **and** the machine, so a corrected export updates
    rather than arriving twice.
  - **Sold Through** is filled in by the system: when the **From** party is a
    **DEALER** on the Party Master, that dealer is recorded as Sold Through, and
    the Product Database shows it too. Between two customers it stays blank.
  - **＋ Installation call** on a transfer raises the installation call for the
    customer the machine went to — the way a dealer's sale gets its call. Its
    Call Number is **`OT-PRODUCT-SERIAL`** (e.g. `OT-MONNAL TEO NF-210`) so it is
    told apart from a sale's `WI-` call, its Complaint and Breakdown Date are
    the **transfer date**, and it carries the customer's city, state and
    engineer from the Party Master and the machine's cover from the Product
    Database. A machine that already has its OT- call is not given a second.

- **Product Database** `/product-database` (menu: Contracts & Warranty) — every machine by model and serial, with its
  warranty, contract and current owner. This is where a call reads cover from.
  It keeps **all 32 columns** of the ProdMaster file — Item Code, the address,
  the PO, PM Visits, the installation fields and the rest. Eleven of them are on
  screen when it opens; **⚙ Columns** offers the other twenty-one, and
  **Export CSV** gives you every one of them whether or not it is on screen.
  **⇄ Transfer** on a row opens *Record a transfer* on Ownership Transfer with
  that machine already picked — choose the To party and the date and save.
  Shown to those who may record a transfer.
  > **Warranty Status** and **Contract Status** here are the words the FILE
  > used. They are not the Active / About to expire / Inactive the system works
  > out from the dates, and the two can disagree — which is worth seeing.
  > **The registers fill it, machine by machine** — product AND serial, never
  > the serial alone. A **sale entry** adds each machine with its warranty,
  > invoice, warranty term and accessories; a **contract entry** gives that
  > machine the contract number, dates, type, status and PM visits (replacing
  > the sale's PM visits), adding the machine if it is not there yet; an
  > **ownership transfer** gives it the new owner, their address and the
  > Transfer Ref and Date. Invoice, warranty term, accessories and transfer
  > details are in ⚙ Columns.

## Masters & documents

What the rest of the application picks from. A value not on a master cannot be
typed into a form that reads it.

- **Party Master** `/parties` — customers and dealers.

  > ### KYC
  >
  > A customer's KYC status is **Pending, Verified or Rejected**, and the
  > register shows it on the row as **✓ KYC Verified** where it is. Beside it,
  > **KYC Records** links straight to whatever has been attached — the GST
  > certificate, the PAN card, the registration.
  >
  > Open a customer to **⤴ Attach a KYC record**. It goes into the Drive **KYC**
  > folder under that customer's name, and the list records who attached it and
  > when. Attaching saves immediately; **Remove** unlinks the record and leaves
  > the file in Drive.
  >
  > **Verified with nothing attached is still Verified.** The status is a
  > decision somebody made — the screen says separately that the evidence is
  > missing rather than arguing with the decision. It never works the other way
  > round: documents alone do not make a customer verified.

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
  > the Product Database beside it. **Who can rebuild it:** a role holding *Rebuild
  > Product Database 2.0* (given once to the roles that edited masters or cover).
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
  > **Imported** (Yes / No) says whether the line is imported. It decides
  > whether a DEMO unit of it needs Pre-Delivery Testing in the workshop. It
  > starts blank (*not known*); set it on this screen if you may edit master
  > records, or with an **Imported** column in the upload — a blank cell there
  > leaves what is set alone.
  Load it under **Bulk Uploads → Product Master (product lines)**, or add one
  line with **＋ Add entry** — Product Code and Product Name are required, and a
  code already there is refused rather than overwritten.
  **✎ Edit** on a row changes everything but the code — the code cannot be
  changed any other way either; **🗑 Delete** is refused while any machine, sale
  or contract carries the code — mark it Inactive instead.
- **Part Master** `/parts` — the item catalogue. An inactive part stays on records
  that use it but is not offered in pickers.
  > **✎ Edit**, **⊘ Deactivate** and **🗑 Delete** are on every row, each with
  > its own Part Master permission. Delete is refused while any spare request,
  > stock, consumption record or Indoor Service job names the part — deactivate
  > it instead.
  > A part's **code and description change only with Rename part**, which moves
  > every record that names it; they cannot be changed any other way.
  > **HSN Code** has its own column: set it on *＋ Add part* or the edit drawer
  > (digits only), or with an **HSN Code** column in the Part Master upload. The
  > 29 parts that used to carry "(HSN:…)" in their description had it moved
  > into this column once, on 01-Oct-2026, and taken out of the description —
  > every spare request, dispatch, consumption and hand-stock line moved with
  > them, so nothing was lost.
  > **Editing a part.** **Spare / Consumable** is a list of the four the Item
  > Master uses; a value your file brought that is not one of them still shows
  > and still saves. **Product** is a multiple choice of the **Product Database
  > names** (ORION-G, VEGA, EXTEND-XT…) — the names a call and a spare request
  > carry — because a shared spare fits more than one machine. **Empty means
  > common to all products.** A value the Product Database does not have (for
  > example an old short form like MTEO from the Item Master file) is kept and
  > shown in **red with ⚠** so you can replace it; the **⚠ Unrecognised
  > product** filter lists them all. Cost is an ordinary field.
  > The **code and description together are the part's identity** — every
  > consumption line, hand-stock row, issue, dispatch, transfer and return names
  > the part by `CODE|Description` — so changing either is a **rename**, and the
  > rename moves all of those records with it. The screen tells you how many
  > will move before you commit to it, and stock balances come out unchanged.
  > A rename will not merge two parts: if the new name is taken, it is refused.
  > **Adding a part needs four things:** Part code, Description, **Spare /
  > Consumable** and **Product** — one or more products, or tick **Common to
  > all products**. Purchase cost is optional.
  > **The whole catalogue loads by itself** every time the screen opens and
  > every 30 minutes — no Load more. **Search everything** matches every word
  > you type anywhere in a part (code, description, product, Spare /
  > Consumable, cost, any Item Master field), in any order.
  > **Filter and bulk edit, as on Standard Complaint:** the Product filter
  > (a product, Common, or ⚠ Unrecognised); tick parts and **Set / Add /
  > Remove products** for all of them at once, or pick **Spare / Consumable…**
  > and **Set for** to change that field on all of them.
  > **Main product → Accessories & allied products** (the panel above the
  > table): one list per main product of the accessories sold with it. Both
  > lists come from the **Product Master**: a line whose **Category is
  > ACCESSORY** is an accessory, anything else is a main product.
  > **What it does on a call:** the **Spare Request** and the visit report's
  > **spare consumption** offer the parts of the call's product, the parts of
  > its accessories, and the common parts — one list, nothing extra recorded.
  > **Show all parts** on either form opens everything, so a part whose
  > mapping is missing can still be requested. A HandStock request (no
  > machine) always lists every part. On the visit report, a part in hand
  > stock that the Part Master does not list is always shown.
  > **Editing** an existing part does not demand them, so an older part with a
  > blank can still be corrected one field at a time.
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
  > **✎ Edit** and **🗑 Delete** are on every row (each needs its own Party
  > Master permission). A party any machine, call, sale or contract still names
  > cannot be deleted — nor one named as a machine's **Sold Through**, an Indoor
  > DC's consignee, or the customer on a Field Failure Report or a material
  > return. The message says how many records name it.
  > **City, State and Country** are on one row; Country is optional and is
  > filled from a *Country* column in the upload.
  > **＋ Add entry** adds a new customer: **Party Name, City and State** are
  > required, everything else can be filled now or later. The Party Key is given
  > when you save. A name already on the master is refused — search for it and
  > edit that one instead.
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
  > **Department** comes from its own list (**Masters → Department** — add the
  > departments there first), so it is spelled one way everywhere.
  > **Many at once:** tick people (the header box ticks everyone the search is
  > showing), choose the Department in the bar that appears, press **Apply**.
  > **Open a person (the row, or ⋯ → view) for their profile:** Employee Code,
  > Joining Date, Department, Designation, both managers, Mail ID, their
  > **Roles & Responsibilities** and their **training**. Employee Code and
  > Joining Date are private: only the person, their managers, User Master
  > administrators and whoever holds **Manage training** can see them.
  > **Roles & Responsibilities:** *＋ Add new R&R*, upload the document (or
  > paste its Drive link) and give **Effective From** (and **To** if it ends).
  > Saving a new one **ends the current one the day before** the new From —
  > nothing is deleted, and *✎ Period* changes either date afterwards.
  > **Everybody sees their own profile, R&R and training under My Profile**
  > (the *Details & R&R* and *Training* tabs), and a manager sees their team's
  > there too (*My Team → 👤 Profile*). A
  > trainee confirms a document with **✓ Read & understood**.
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
  > **CORRECTING SOMEBODY'S NAME.** People are matched by NAME, so the save
  > moves everything to the new name: everybody who names this person as
  > Reporting or Regional Manager, and everything filed under the old name —
  > calls allotted to it, call requests, spare requests, consumption, hand stock
  > and stock transfers, and the Service Engineer on the Party Master and
  > Product Database. The screen says how many team members move before you
  > save. **What is not changed**: who approved, dispatched or recorded
  > something keeps the name it was signed with. Two cases move nothing:
  > another row with the same old name (correct those by hand), and a change of
  > capital letters only. Only an administrator can change a name.
  > **One person, one row.** Where two rows share an email the role still
  > applies, but the name stops following, because there is no way to tell which
  > of the two is theirs.
- **All Masters** `/masters` — the value lists behind the dropdowns. Rights are
  **per list**.
  > Each list has its own **Add**, **Edit** and **Delete** permission. **✎ Edit**
  > on a row can **rename** a value: calls and reports already saved keep the old
  > wording, so a count or filter on the new wording does not include them.
  > A value in use is **deactivated**, not deleted, so records that used it keep
  > reading correctly.
  > **Standard Complaint carries a Products column.** Tick the products a
  > complaint applies to — as many as it needs — or leave it empty for **all
  > products**. Every complaint that existed before this reads as all products,
  > so nothing stopped being offered. Press ✎ on a row to change it.
  > **Filters:** Complaint name, and Product — which lists the complaints
  > mapped to that product; "All products (no mapping)" lists the rest.
  > **Bulk edit on the screen:** tick complaints (the header box ticks every one
  > the filters show), then **Set products to** / **Add products** / **Remove
  > products**, choose the products and press Apply. Set to nothing = all
  > products; adding or removing never narrows an all-products complaint.
  > **By upload** (Bulk Uploads → Master Value Lists → Standard Complaint): add a
  > **Products** column — several products separated by commas, or blank /
  > `All` for all products. A file **without** a Products column updates the
  > complaints and leaves every product mapping exactly as it is.
  > **The upload never renames a complaint.** Export CSV carries a **Key**; a
  > row with a Key updates that complaint's Products only, whatever the name
  > column says. A row without a Key updates the complaint of that name
  > (upper/lower case ignored), or is **added** if the list has no such name. A
  > Key that matches nothing is held back and named.
  > **On every call form the Standard Complaint list follows the product**: the
  > complaints mapped to that product plus those mapped to all products. Until a
  > product is chosen, every complaint is offered. A call that already carries a
  > complaint keeps it even if it is not on the product's list. The list is kept
  > on the device, so a Call Request fills it with no signal.
- **How RITHI Functions** `/knowledge-base/how-it-works` — how the system works,
  in four parts:
  > **All modules** — every screen in the menu, in menu order: what it is for,
  > what you do there, what it refuses, the records it keeps, and the data flows
  > it is part of (a chip opens that flow). It says whether your role opens the
  > screen. A screen added to the menu without an entry here fails the build.
  > **The Call, Spare, Hand Stock and Quality & Analytics documents, and the
  > Spare tables** — the long illustrated explanations, step by step: what each
  > step reads, what happens, and what it refuses or demands.
  > **Data flows** — fourteen workflows drawn as diagrams: a call's life, quality,
  > hand stock, a sale, installation, PM, the HandStock spare route,
  > reconciliation, the workshop, documents and training, the masters, people and
  > access, bulk loading, and reports. **▶ Play** walks one through a step at a
  > time — played steps stay, the current one is lifted with its explanation
  > below, the arrows into it run; **Pause**, **Previous**, **Next** and
  > **Reset** do what they say, and clicking a box stops and opens it.
- **Service Manuals** `/service-manuals` — indexed by product, so a call shows the
  right ones.
- **Technical / Service Notes** `/service-manuals/notes` — technical bulletins and
  service notes, by product, kept the same way as the manuals. Whoever can open
  Service Manuals can open these; adding them needs the same permission.
  > **Always grouped per product, newest first** (the grouping cannot be turned off). A note covering several products is
  > listed under each of them; a note with none is under **Every product**.
  > Inside a group the notes run by **Dated** — the note's own date, which you
  > type in on the form (or the **Dated** column of the upload) — newest first.
  > **Latest** is added by itself to the newest *dated*, *live* note of each
  > product. Add a newer note, change a Dated or retire a note and the tags move
  > on their own; **↻ Refresh Latest tags** re-does them for every product if
  > they ever look wrong. A note with no Dated, or a retired one, is never Latest;
  > two notes on the same newest date are both Latest. A note for two products
  > can be Latest under one and not the other.
  > **Edit shows every field** — Document No, Revision, Issue / Effective date,
  > File name, and each column the upload kept with the note (under **More
  > fields**). **✏️ Beta Edit** turns the list into a grid: change any cells on
  > any notes (changed ones are marked), then **💾 Save all** saves them all at
  > once. If one cannot be saved, none are, and the message names the note.
  > **Cancel** asks before throwing changes away.
  > **A note can cover several products** — tick them all. None ticked means it
  > applies to every product. **A call's 📄 Supporting documents lists every
  > active note for its product** beside the manuals; a retired note is not offered.
  > **Added, Added By and Updated are Drive's** for a note loaded from the Drive
  > listing — its Created, Last Modified By and Last Modified. When and by whom
  > it was entered in RITHI is under **Record details** when you edit it.
  > **Many at once:** Bulk Uploads → **Technical / Service Notes** — Title,
  > Product (spelled as the Product Database spells it; several products
  > comma-separated), the Drive Link, and optionally Dated, Document No, Tags, Notes,
  > and the listing's Created, Last Modified and Last Modified By. Matched on the
  > Drive link, so loading the list again corrects those notes rather than
  > adding them twice.
- **QMS Documents** `/qms` — with number and revision.
  > **Adding a document asks who must be trained on it** — roles,
  > designations, departments, regions or named people (anyone matching any of
  > them, active on the User Master). Each gets it on their training list.
  > **The whole Master List at once:** Bulk Uploads → **QMS Documents (Master
  > List)** — Document No, Title, Revision, Effective Date and the **Drive URL**
  > of each file. Re-loading a corrected list updates those rows (matched on
  > Document No + Revision); every other column of your list is kept with the
  > document. A bulk load assigns no training.
- **Training** `/training` — who must be trained on what, and where each stands.
  > **Assign training** picks a QMS document (or types a topic), a due date and
  > the people. **Record session** is bulk training: topic or document, date,
  > trainer, method, the attendance sheet / certificates, and each attendee's
  > Attended, **Pass / Fail**, score and remarks.
  > **Complete** means attended a session on it, or confirmed **read &
  > understood** — and a **Fail keeps it open** (*Failed - retrain*) until a
  > later session is attended without one. Past the due date it reads
  > *Overdue*. Click a name for that person's full past training, grouped by
  > topic. Nothing here is ever deleted; a wrong assignment is **cancelled with a
  > reason**. Open to admin, VP Technical and R&D Engineer (grant **Manage
  > training** to others on Roles & Permissions).

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
  > you; sharing it with a role or with everyone needs *Share a chart* (part of
  > *Manage configuration*).
  > **Sharing a chart never shares data**: what is saved is the question, not the
  > answer, so each reader still sees only the failures their own role may see.
- **My Workload** `/workload` — everything waiting on you, across the registers
  you can open. **Click a card and you get the list behind it.**
  > A card with nothing to open stays a plain figure — there is no list of an
  > *ageing of four days*. You see a section only for a register you can already
  > open, so nothing here grants you anything you did not have.
  > The counts are the registers' own, so a card and the list it opens agree.

  > **Installations waiting on Commercial** lists every installation request
  > that has not become a call yet, split by the question that decides whether
  > it can proceed: **customer KYC verified**, **waiting on KYC**, or
  > **customer not on the Party Master**. The last is kept separate because it
  > needs a different fix — add the customer first, then verify them. Clicking a
  > card opens the Call Request register on that exact slice, with each
  > customer's KYC shown on the row.

## Across every register

- **The filter chips above a list fold away.** Click the heading — *Engineer*,
  *Status*, *Product* — to hide the row, and again to bring it back. A long row
  starts folded and a short one starts open, and whatever you choose is
  remembered on your device for that screen.
  > **Folding the chips never removes the filter.** If one is applied it stays
  > on screen with its count and one click clears it — otherwise you would be
  > looking at part of a register with nothing saying why.

- **Downloading a register that has not finished loading now warns you first.**
  You get a pop-up saying how many rows will be in the file, that more exist,
  and what to do about it. Cancel, press **Load more** until the button
  disappears, then download again.
  > **Why it exists**: a register loads in pages, and the screen says so — the
  > count carries a `+` and a Load more button sits beside it. **The file says
  > nothing.** Opened in Excel a day later it is just rows, and there is nothing
  > in it, anywhere, to show the register had more. That is how "the data is
  > missing" gets reported when the data was simply never fetched.
  >
  > **A fully loaded table never interrupts you.** No `+`, no Load more, no
  > pop-up — so seeing one is itself the signal that there is more to fetch.
  >
  > **You can still export anyway.** Filtering to one engineer and taking the
  > first two hundred rows is a perfectly good thing to do. The point is that
  > nobody can now do it without being told.

## Analysis & reports

- **KPI & Failure Analysis** `/kpi` — failure rate by product, region × cover, and
  spare use by cover, product and region.
- **Part Search** `/part-search` (Overview) — look a part up: every **active**
  part with its Part Code, Description, Spare / Consumable and the products it
  fits (a part with no product reads *Common (all products)*). Search by code,
  description or product — all the words, in any order — and every column has
  its own **type-to-search filter** (Part Code, Description, Spare /
  Consumable, Products), each offering only what the other filters leave on
  screen; a common part stays listed whatever product you pick. **It is read only for everybody, administrators included**: no edit, no
  buttons, no download. Parts are changed on the **Part Master**. Every role can
  open it; an administrator can untick it per role on Roles & Permissions.
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
  > **Every record is read, however many there are.** If one kind of record
  > cannot be read, a red banner names it and the reason, and the count carries a
  > **+** — the list is then known to be incomplete.

  > **You can also open it from a review.** The Daily Complaint Review Register's
  > Review Desk has a **🔎 Machine History** button beside *Raise FFR*: it opens
  > the same thing in a pop-up for the machine on that call, so you do not have
  > to leave a half-answered review to find out what this machine has already
  > done. Close it and you are back where you were. A call that does not record
  > **both** a product and a serial says so rather than guessing — a serial on
  > its own is not a machine.

- **Objective** `/objective` — the year's objectives with targets, owners and the
  month-by-month actual.
  - **Status**: each objective is Active, **Not Working** or **Do Not Use** (✏️ on
    the objective). The last two are hidden; tick **Show hidden** to see and
    change them. Hidden objectives are still edited and re-calculated as usual.
  - **Re-Calculate is explicit**, never on opening the page. Only objectives with
    a formula, only up to this month, never a typed figure.
  - **You can type over a calculated (ƒ) month.** It becomes a **manual
    override** and shows **✎**; hover it to see who typed it, when, and what the
    calculation had said. Every Re-Calculate that finds overrides lists them and
    asks: **Keep** them (the default — they stay exactly as typed, every run) or
    **Discard** them (those months are recalculated and the ✎ goes).
  - Each month is measured as at the end of that month.
  - A **Recent Failure Rate** is the machines installed (warranty start) in the
    last 12 months that had a field call within 3 months of installation, over
    all the machines installed in those 12 months. Both numbers are set on
    SLA / Objective Configuration.
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
- **Reports — Stores Dispatch Report** `/exports/stores-dispatch` — every spare
  dispatched, one row per line, in the **AppSheet Stores format**: OR|Part, SO NO,
  Timestamp, TO and the engineer's address, quantities, Item Status, **IND/IMP**,
  and **Dispatched in (Days)** with its band (00-03D … >60D).
  > **Days are exact**, to one decimal, from the request's **final approval** —
  > the latest of RM, Commercial and NSM — to the dispatch. 0.7 is about 17 hours.
  > A spare with **no approval time recorded** reads **No approval date**, not a
  > number: AppSheet called those ">5 yrs", which was an empty date, not 5 years.
  > **IND/IMP comes from the Part Master** — set it there, or load it with the
  > Part Master upload's IND/IMP column. Blank until you do.
  > **From 1 January 2025 it also lists the historical stock outs** you loaded
  > with Bulk Uploads → *Stock Out — all years*, beside the dispatches made in
  > RITHI. Tick the **Source** column to see which is which; a stock out that is
  > in both is shown once. For a historical row the approval date is the one in
  > that file, the days are worked out the same way, and Requested Qty is blank
  > because the file does not have it.
- **Reports — Not Consumed Against this Call** `/exports/unused` — `NOT USED`
  where none was booked, `SHORT` where less was booked than sent. Refused and
  dropped lines are excluded.
- **Reports — KPI Export** `/exports/kpi` — the workbook's Field_INST_PM tab in its
  own column order — Field, Installation and PM calls; cancelled calls excluded
  entirely.
- **Hand Stock Report** `/handstock-report` — **Admin and Technical Support to begin with**;
  every other role is a tick on Roles & Permissions, and that tick gives the
  role the menu entry as well as the page. One line per engineer and part:
  every engineer's stock for an office role, and for anybody else their own
  stock plus their team's, if they manage one. The file's About sheet says
  which.
  > **It shows the workings, not just the number.** Opening, Stock Out,
  > Consumed, Transferred In, Transferred Out, Returned and **Other ±** (stock
  > adjustments) sit beside On Hand, so whoever is reconciling can add it up
  > rather than take it on trust.
  >
  > **A negative On Hand is a finding, not a rounding error** — it means more
  > was consumed than this system knows was issued. Those figures are picked
  > out on screen.
  >
  > **It loads in pages of a thousand and keeps going by itself** until every
  > line is in. The count carries a `+` while they are still arriving and the
  > download buttons stay greyed out — a stock file is reconciled against, so a
  > short one is not a shorter answer but a wrong one.
  >
  > **Three formats**, named `HandStock_24-Sep-2026_181503` with the extension:
  > `.csv` (text only), `.xlsx` (numbers stay numbers, dates stay dates — use
  > this one), and `.xls`, which is the Excel 2003 XML format. Excel may say
  > the format and the extension do not match before opening the `.xls`; it
  > opens correctly after that.
  >
  > **Both workbooks carry an About sheet** saying what the file covers, how
  > many rows and when it was taken.
  >
  > **Nothing is stored.** Hand stock is derived from the movements — issued −
  > consumed ± transfers − returns — so this report and the Hand Stock register
  > cannot disagree.
  >
  > **If your role is only shown its own records**, the subtitle says so. The
  > file is then your stock, not the company's.

- **Machines Without an Installation Call** `/install-calls-unmapped` —
  **administrators only** (and Technical Support, which holds every page an
  administrator does; change it on Roles & Permissions).
  Every warranty machine whose **INST Call** holds no call number, with **why**
  and the **installation calls that could be its own**.
  > **Once, on 2 October 2026**, every machine was matched to its installation
  > call by, in turn, the call number **WI-&lt;Product&gt;-&lt;Serial&gt;**, then
  > **Product + Serial + Party Name**, then **Product + Serial** — installation
  > calls only, and only where **exactly one** call fitted. What could not be
  > settled that way is here, with the reason: no installation call; the call
  > is already on another machine line; one match not mapped (two lines claim
  > it); or several calls to choose from. **The list changes nothing** — put the
  > right UCN in INST Call from the Warranty Register, and the machine leaves
  > the list.

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
  The work runs in four **stages**, one page each, shown as a stepper at the
  top of each job and as a chip on every row of the register — and a job opens
  only the stages it has reached (no DC page at intake, for example):
  - **The Repair page opens with the Workshop record.** For a job with a call
    it asks **Call Status** and **Call Pending Reason**, with exactly the Visit
    Entry's choices and rules — and they are the visit's own values, filed with
    it when the Indoor DC is approved. The job's status follows: Solved →
    **Ready** (after the QC Pass for a Repair, Rework or Troubleshooting);
    Unsolved with spares not available → **Awaiting spares**; other Unsolved →
    **Under repair**. A Demo / new device keeps its Status box.
  1. **Intake** — **Receive equipment** opens the intake form, with three
     options: **Field Return**, **Demo** and **New Device** (Demo → activity
     Demo; New Device → Troubleshooting, its own kind, its own **New Devices**
     register sheet, sent on the DC to where it is going). A **Field
     Return** (a unit that came in on a call) is always a **Troubleshooting**
     job — it follows the Repair rule, so it cannot leave until its quality
     check is recorded. The **Identification tag** is **Yes, Identified** or
     **Not Identified**, for the unit and for each accessory; accessories are
     listed as Item, Qty and Tag. For the call, either pick the
     **Product Name** and **Serial Number**, which lists that machine's **open
     calls** to choose from, or **type the UCN**. The job then fills itself from
     the call: UC No, customer and place, the engineer the call is allotted to
     now, the machine, its cover (Item Status) now, and the complaint (Problem
     Reported); the call's Standard Complaint shows beside it, read only. Fix
     anything that is wrong. A **DEMO / new device** is received without a call.
     List the **accessories received**: each item with its **quantity**
     (and serial / tag where it has one), **+ Add item** for more.
  2. **Cleaning** — **Mark cleaning done** against the work instruction
     (WI/SER/01) and its revision.
  3. **Repair — the service report** — once the unit is cleaned (never
     before). This page **is** the Indoor Service Report: enter the **report
     number**, pick the file (saved in Drive as **“<report no>_<file name>”** so
     it traces back here; the system records who uploaded it and when) and, for
     a unit with a call, fill that call's **visit details** right there on the
     page — Complaint Observation, Job Done, Add Consumption? with the spares
     used, and the rest of the Visit Entry. **Visiting Service Engineer** starts
     as you; pick whoever actually attended the unit (anyone active on the User
     Master) — the visit is filed under that name, and the spares come from
     that person's hand stock. *Call Status* (**Unsolved**), *Call
     Pending Reason* (**Return to Field**) and *Update Visit Work Details?*
     (**Yes**) are fixed. Each thing is asked once: the call's Standard
     Complaint comes from Intake, and Complaint Observation / Job Done are the
     job's findings and work done. **Upload service report** saves it; nothing is
     written to the call yet — it is a draft, filed when the DC is approved.
     **Request spare** sits beside it (the usual Spare Request form with the
     job's call filled in and you as the requester; it does **not** change the
     call). Below: the job's status, any damage, the parts and checks the
     activity needs, and the **quality check** (a repair cannot leave without
     one). **⭱ Upload** in the register's *Indoor Service Report No* cell opens
     this page directly.
  4. **DC** — once the report is uploaded (see *Indoor DC* below), then
     **Dispatched** once the DC is approved.

  A job opens as a **window** in the middle of the screen (× or **Esc** closes
  it) on the stage it is at; the stepper at the top moves between the stages
  already reached, and **← Back** / **Next →** sit at the bottom.

  **Deleting a job** received in error — the wrong unit, a duplicate, a test —
  is **Delete job** at the top of the window, for whoever holds *Delete an
  Indoor Service job* (an administrator; nobody else until it is ticked in
  Roles & Permissions). Say why and type the job number to confirm. It is
  **permanent**: the job, its accessories, parts, checks and Pre-Delivery
  Testing are removed, the number is not used again, and the deletion is
  recorded with your name and the reason. A job that has been on **any** Indoor
  DC (even a rejected one), or whose visit has been filed on its call, cannot
  be deleted. **Nor can a job that has been worked on**: verified or
  re-verified, its Pre-Delivery Testing signed, reported to the customer,
  condemned or disposed of, or its report uploaded — those are quality records.
  A QC result, checks, parts or an unsigned PDT on a job received in error do
  not stop the deletion.
  > A job does not need a call — a demo unit has none, and files no visit. A
  > harvested part cannot go back into stock until decontamination is recorded.

  **The paper register R/SER/07 lives here.** Each job carries its columns:
  Field Service Report No, Engineer Name (filled from the call's engineer when
  you enter a UCN; "Indoor Service" for a DEMO unit), Customer Place, Problem
  Reported, **Status — which on R/SER/07 is the machine's cover** (WGP / OGP /
  CMC / AMC, read from the Product Database when you type the product or
  serial, and changeable), Indoor Service Report No, DC No. and DC Date, and
  Remarks. The **R/SER/07 register view** opens first and shows the register as
  the paper keeps it (plus a *Stage* chip on screen), one sheet at a time — *Customer – Devices* or *Demo* — with S.No running in
  incoming-date order; from there **Excel** downloads both sheets and **Print**
  prints the sheet you are on (landscape A4). Both need the export right. The
  register is the usual table: drag a heading to move a column, its edge to
  widen it, **⚙ Columns** to show or hide one, **Wrap** for long text — it
  remembers. Every job is on screen, so the count is exact.

  **Verified by** is a supervisor's step: once the unit is Dispatched, Closed
  or Condemned, somebody holding *Verify an Indoor Service register entry*
  presses Verify, and the system records who and when. Nobody holds that right
  until an administrator ticks it in Roles & Permissions.

  **Pre-Delivery Testing (R/SER/QC/007)** is for a **DEMO unit of an imported
  product** only — in-house equipment and customer machines do not have it.
  Whether a product is imported comes from the **Product Master** (the Imported
  column). Fill the date, measuring equipment, software version, HV, HT, checks
  1–5 (OK / NOT OK) and the two readings tables, then **Sign as the
  inspector** — your name and designation are recorded by the system. The unit
  **cannot be Dispatched or Closed** until every field is filled, it is signed,
  and every check reads OK. **Print R/SER/QC/007** prints the form; a test that
  is not finished still prints, with a band saying so.
  > If the job says it is **not known** whether the product is imported, the
  > test is not demanded — set Imported on the Product Master for that line and
  > the job will ask for it.

  **Indoor DC — the delivery challan a unit leaves on.** In the workshop view,
  someone with the dispatch right ticks the **Ready** units (report uploaded)
  going to **one** consignee (the customer, or for a DEMO unit the party it is
  going to) and presses **Create Indoor DC** — or, in a job's **DC** page,
  presses **Create Indoor DC**: the window splits in two, the job on the left
  and the DC form on the right (drag the line between them to resize; × on the
  DC side closes just that). *To* is filled from the Party Master and can be
  typed over; add the MIRN / customer reference and its date, mode of despatch
  and the purpose (once for the DC, changeable per line). The **DATE is the day
  you enter it** and cannot be changed. Choose **AUTHORISED BY** — all three
  come from **your row in the User Master**: your Reporting Manager, your
  Regional Manager, and as **NSM** the Reporting Manager on your Regional
  Manager's own row. You cannot name yourself. That person approves the DC. Each unit prints as a line — PART No. is its
  product code where RITHI knows one — and each accessory as a line after it
  **with the quantity received**. The **number (IDC-YYMM-NNNN) is given by the
  system**; it is written on every unit as its DC No. with the DC date.

  **The Indoor DC needs approval** (only this DC — the spare DC does not). A new
  DC is **PENDING APPROVAL**: its print carries a band saying so and the
  AUTHORISED BY box stays empty; its units cannot be marked Dispatched yet. The
  person named (or an administrator) sees it **first in Indoor DCs**, and on
  **My Workload** under *Indoor DCs — Awaiting my approval* — **whatever their
  role**: someone whose role cannot open Indoor Service is taken to a page
  listing just the DCs that name them (it says *No Indoor DC names you as
  Authorised By* when there are none) — and presses
  **Approve** or **Reject…** (with a reason). **Approving files the visit**: for
  every unit with a call, the visit drafted with its Indoor Service Report is
  filed against the call — Unsolved, pending Return to Field, with the work
  details and the uploaded report — exactly as if it had been entered on the
  call; then the DC is approved and its print shows the approver's name.
  > Approving files every unit's visit and its spares **in one step**: if one is
  > refused (for example a spare the engineer does not hold), nothing is filed,
  > the DC stays pending and the message says why. Only approving the DC marks a
  > visit as filed — it cannot be set by editing the unit. **Rejecting** keeps the DC with its reason and
  > frees its units for a new DC.
  > If the person's name is **corrected in the User Master** while a DC is
  > still waiting for them, the DC follows the new name so they can still
  > approve it. A DC already approved or rejected keeps the name it was printed
  > with.
  > A unit is refused if it is not Ready, has no uploaded report, is already on a
  > DC, or would not be allowed to leave (no quality check on a repair, a failed
  > check, a DEMO unit of an imported product without its Pre-Delivery Testing)
  > — the message says which. Units for two consignees cannot share a DC. A DC
  > is never deleted; **Indoor DCs** lists them all and prints any of them again.
- **Spare Recycling** `/indoor/recycling` — a **separate track** for recycling
  defective spares, with its own stock. Nothing here touches calls, Spare
  Requests, Stock Out or the regular Hand Stock. **While Audit Mode is on the
  whole page disappears** (an open page goes back to the home screen), along
  with its menu entry, guide entry, data flow and SLA section.
  - **Register** a defective spare (RCY/26/0001): the part, quantity,
    received on, its **Source** — **Service Return** or **Defective Spare** —
    and an optional call reference (text only). There is no serial. **A
    quantity of 3 becomes 3 requests**, one per spare.
  - **Import from MRN**: search any MRN, **Pick** a line and import its good
    and defective quantity — each spare becomes its own request, carrying the
    MRN No, with the Source **Defective Spare**. The MRN itself is not changed, and a line can be imported again.
  - **Start Work** on a request with the date and time. **The SLA starts only
    then**: due **3 working days** later, Saturday and Sunday skipped — both
    set on **SLA / Objective Configuration → SLA Targets → Spare Recycling SLA**. The list
    shows Work Started, SLA Due and **On track / Due today / Breached**
    (**Met** once closed in time).
  - **Raise MRS** (RMRS/26/0001) for the spares you need — **no approval**.
    Stores presses **Stock Out** on the line, enters the quantity and **unit
    cost**, and it goes into **your recycling hand stock**.
  - **Open** a request to record the **job done**, **consume** from your
    recycling hand stock (never more than you hold) and add **other costs**
    (labour, courier, vendor, other).
  - **Close** it as **Returned to Service Store** — recorded as **R<PartNo>**;
    the Part Master is not changed — or **Not recyclable** with a reason. The
    job done must be filled first; a closed request cannot be changed.
  - **Cost**: each request shows parts (at their stock-out cost) + other
    costs; the Cost tab totals everything spent on recycling.
  - **Delete**: tick one or more requests in the list (or open one) and press
    **Delete** — open or closed. Its consumption and other costs go with it
    (the parts return to your recycling hand stock); an MRS raised against it
    is kept. Needs **Delete a recycling request**.
  - Its keys are given to no role — grant them on **Roles & Permissions →
    Indoor Service**.
- **Pre-Delivery Quality Check** `/indoor/pdqc` — imported machines received
  in the godown are checked here **before billing**, as per **R/SER/QC/007**.
  A register of its own: no Indoor job, any product.
  - Each check is numbered **PDQC/26/0001** (restarting each year) when it is saved.
  - **+ New check**: pick the product from the Product Master, type the SL. No,
    and fill the date, Measuring Equipment ID, Software Version, HV, HT,
    checks 1–5 (OK / NOT OK) and the CMV/ACMV and PCMV readings at FiO2 21, 60
    and 100%. **Every field is mandatory** — Save stays off until all are filled.
  - **Whoever saves is the inspector** — your name and designation (from the
    User Master) are recorded. Correcting a check later signs it as you.
  - **A record only**: a NOT OK is recorded and shown in red in the list;
    billing is not blocked. A check is never deleted.
  - **🖨 Print** gives the R/SER/QC/007 sheet; **Export CSV** downloads the list.
  - Recording needs **Record a Pre-Delivery Quality Check** — given to no role;
    tick it on **Roles & Permissions → Indoor Service**.
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

- **User Access** (`/users`) is gone: it opens the **User Master**, where logins
  are created, roles assigned and — by an administrator — passwords reset.
- **A new login's starting password** is the one proposed on User Master → New
  User (you can type another). The person signs in with it and can change it
  under My Profile; they are not forced to. That is deliberate, for ease of
  operation — it does mean anyone who knows the starting password can sign in as
  that person until they change it.
- **Signing in** is only ever with a RITHI login (e-mail and password). There is no
  demo sign-in and no sheet sign-in. A forgotten password: ask an administrator —
  both the sign-in and the reset screen say so.
  > **A login that is not set up gets nothing.** If somebody can sign in but has no
  > profile and no User Master entry, they see one page asking them to get an
  > administrator to add them to the User Master, and a Sign out button — nothing
  > else, and the database refuses them too. Add their User Master row and they
  > arrive with its role the next time they sign in.
  > **"Not connected to the RITHI database"** on the sign-in screen means this
  > browser was pointed at another database in Settings; press **Reconnect to the
  > RITHI database**.
- **Roles & Permissions** `/roles` — which role holds which right, page by page and
  action by action. Roles can be added without code.
  > **Every button has its tick on its own page's row.** Open a page's row and you
  > see each thing that page lets somebody do — including a right that belongs to
  > another module but is used there (a call register shows *Request spares* and
  > *Reco*). The **Installation** and **PM** registers have their own ticks now:
  > allowing Field Call edits no longer allows PM edits. Nothing changed for
  > anybody on the day this arrived — each new tick was given to exactly the roles
  > that held the one it replaced.
  > **A tick with parts.** *Manage users*, *Edit masters*, *Edit sales /
  > warranties*, *Edit contracts* and each register's *Edit* and *Report* are made
  > of smaller ticks listed under them. Ticking the big one gives all its parts
  > (they show ticked). Unticking one part unticks the big one and leaves the
  > other parts ticked, so the role loses only the part you unticked. So you can let somebody verify KYC without editing parties, or
  > create logins without deciding what those logins may do — a login they create
  > is an Engineer until somebody with *Assign roles & grant permissions* changes it.
  > **Only the Admin column is greyed** — Admin holds everything and cannot be
  > narrowed. The things that used to be "Admin only" (bulk uploads, PM bulk upload,
  > the Data Import panel, exporting tables and export schedules, Audit Mode,
  > resetting a password, changing a spare request's engineer, correcting a review
  > date, locking the objective cut-off) are ordinary ticks now: nobody but Admin
  > holds them until you tick them for a role. **Reset a password** is never part
  > of *Manage users* — tick it on its own — and somebody who is not an
  > administrator can never reset an Admin's password, or that of anyone who can
  > grant permissions. A role given an administration page sees it in the menu.
  > **If a role sees nothing** it is almost always a missing *action*, not a
  > missing page: a role with some permissions but not "View calls" sees an empty
  > register with everything apparently granted.
  > **If a MENU ENTRY is missing entirely** — the screen exists, other people
  > describe it, and it is simply not on your menu — that is the page
  > permission, and it is the one thing that shows no error at all. Tick the
  > page here for the role. The headings and their order match the menu exactly,
  > so look for it under the group it sits in on the left.
- **Audit Log** `/audit` — what the application recorded: actions, sign-ins, errors
  and how long they took. It records all the time, whatever Audit Mode says. The
  history of Audit Mode being turned on and off, each with its reason, is on
  Admin Config.
- **Admin Config** `/admin-config` — the settings the rules read: the Call
  Registration desk and audit mode. (The SLA targets and the frequent-failure
  rule are on SLA / Objective Configuration; the objective cut-offs and their
  lock are on the Objective screen.) The desk is open to anybody given
  *Admin config*;
  switching Audit Mode and the Data Import panel each have their own tick on
  Roles & Permissions (*audit.mode*, *import.panel*). **While Audit Mode is
  ON** a call's Update Party Details and Update Product Details are hidden (and
  refused).
- **SLA / Objective Configuration** `/sla-objective-config` — the targets the
  service is measured against. **SLA Targets**: the hours for first visit and
  closure, each switchable. **Product Failure Rate**: a machine has *failed*
  when a field call on it is registered within **3 months** of its installation
  (its **warranty start**); the rate is over the machines of that product
  installed in the last **12 months** (rolling, up to each month's cut-off). A
  machine with several calls in its window counts once; one with no warranty
  start is in neither number. Both numbers can be changed here — the change
  applies from the next **Re-Calculate** on the Objective screen, and figures
  already written stay until then. **Frequent Failure**: the window and
  threshold Review 2 uses — rule 1 (the same machine) and rule 2 (different
  serials, same complaint). A change applies from now on; answers already
  recorded stay as they were.
  > **Admin** has this page with every action. **Technical Support** has the
  > page but reads it only, until *Admin config* (SLA targets, Frequent
  > Failure) or *Edit, recalculate and cut off the quality objectives* (the
  > Product Failure rule) is ticked for the role. Give the page to any other
  > role on Roles & Permissions → Administration → SLA / Objective
  > Configuration.
- **Software Validation** `/software-validation` — the ISO 13485 §4.1.6 package:
  intended use, regulatory basis, requirements and the tests that answer them.
  > Not the servicing process requirements. Software validation does not discharge
  > a process requirement, which is why they are two documents.
  > **Data Flows** draws how a record moves from screen to screen — fourteen
  > workflows, from a call's life to bulk loading and reports. Select a box to
  > see what that step does, where, and the requirements and tests behind it, or
  > press **▶ Play** to walk through it step by step. The same diagrams are under
  > **How RITHI Functions → Data flows**.
- **Settings** `/settings` — the database and CallReg sheet connections for this
  browser. Your theme and account are on My Profile.
- **Your Profile** `/profile` — **one tab per section**: Account, Details &
  R&R, Training, **My Team** (only if people report to you — split into
  **Active / Current** and **Ex Employees** by the User Master's *Active*
  column; a leaver's profile and training stay one click away), What I can do,
  Signature, Password and Appearance. The tab you last opened is remembered on
  that device. **My Signature** lives here, not in Settings:
  only you can see or set it, and it prints only in the block that names you. An
  administrator can ask who has saved one and remove a leaver's, never read one.
- **Version History** `/version-history` — what changed in each release.
