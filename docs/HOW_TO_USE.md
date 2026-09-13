# Field Service Handbook — how to use the new modules

Shareable copy: <https://claude.ai/code/artifact/a6cb9ac1-cd68-47f7-9ce9-7e88eafc5908>

What each screen built this cycle is for, the order things happen in, and the
few rules that are easy to get wrong. Written for the people using it, not for
the code — when a rule here and the code disagree, the code is the fact and this
file is the bug.

---

## Field Failure Register
**Quality → Field Failure Register** · needs "Read the whole Field Failure Register"

The register of failures that go back to manufacturing, on the controlled form
`R-SER-03 Rev MAR 2020`. Reports are numbered by the system as `FFR - 001/26`,
restarting each year.

**A report raises itself.** You do not create an FFR by hand. Answer the Daily
Call Review, and if **any** of Risk to Patient, Warranty Failure or Frequent
Failure is *Yes*, the register raises the report from that review's own details
and dates it the day Review 2 was completed.

**Working a report** — Register tab → Desk:

1. Reports on the left, the report in the middle, and on the right the call it
   came from: every visit, and the spares used, with the part code and the part
   name in their own columns.
2. **Edit** to fill in the investigation — observation, CAPA responsibility,
   CAPA number and status. Edit and Print are at the top of the pane.
3. **Print** for the R-SER-03 page, or **Word** to download it. If you have
   saved a signature and the form names you, it prints; anyone else gets an
   empty block to sign by hand.
4. **Close it** by setting the report status to Closed. Nothing is ever deleted
   — a cancelled report is marked, not removed.

> If the review is later changed to *No*, the report still stands and shows as
> **withdrawn**. A quality record is never deleted, and the withdrawal is itself
> the thing worth seeing.

**Insights** answers questions rather than showing totals. Click any bar, column
or slice — a machine, a cover type, a month, a root cause, a customer — and every
figure narrows to it. Click again to clear. Choices combine, each gets a chip,
and the bar says how many of the total you are looking at.

**Every change is kept.** Each save writes one entry holding only the fields
that actually changed, with who and when. It is written by the database, so an
edit made any other way is recorded too, and nobody can edit or tidy the log.

## Loading old FFR years
**Bulk Uploads → Quality → Field Failure Register (any year)**

- Export one year's tab as CSV and load it. Any order, as many times as needed.
- **Matched on the FFR number and the machine.** One paper report often covers
  several units — `16/18` in 2018 covers serials 252, 253, 254 and 255 — and each
  keeps its own row, serial and installation date.
- **Nothing is thrown away.** A column no other year has is kept on the report
  and listed as "kept on the row". Say what an unfamiliar heading should be and
  it can be made a proper column.
- Loaded reports are marked as migrated, and keep the sheet's own "Raised by"
  name rather than being attributed to whoever ran the upload.
- A row with no FFR number is not loaded, and is listed with the reason.
- The 2016 tab writes dates American-style. Where a column proves that (a day
  above 12 in the month position) it is read that way and the screen says so.

## Daily Call Review
**Quality → Daily Call Review**

- **Your name is recorded automatically** when a stage becomes complete — on
  every path, including auto-save and the bulk answer. A later edit does not
  reassign it: the person who answered the review is the reviewer.
- **Review 2 in bulk** refuses any call that failed inside the first year or
  whose age is unknown; those are reviewed one at a time.
- A call logged today stays pending all day. From 9:15 the next morning its
  Review 2 answers itself *No*, recorded as "Auto (9:15 am)".

## Call Review
**Quality → Call Review**

A second look at the *report* on a solved call — a different question from the
Daily Call Review, which asks what the failure was.

- Lists solved calls only.
- Book a spare the engineer did not record: it goes on as a **Reconciliation**
  line, visibly a correction rather than the engineer's own entry.
- Re-open the call, or mark it **Report Reviewed**.

## Objective
**Quality → Objective**

- **Re-Calculate is explicit** — never on opening the page. It writes only
  objectives that have a formula, only up to this month, and never a figure
  somebody typed.
- Each month is measured as at the end of that month, so a call closed since
  does not move an earlier figure.
- A quarterly objective is measured over its whole quarter and reported in the
  quarter's last month; the other two read NA, not zero.
- **It shows its working**: the calls, the machines and the arithmetic on three
  tabs, the third counted from the first two, so the file adds up to itself.

## Indoor Service Register
**Service → Indoor Service Register**

Two things are asked separately and mean different things: whose **property**
the unit is, and what **activity** is being done to it.

1. Received
2. Cleaned and disinfected — recorded before anyone works on it
3. Findings and work done, including parts harvested
4. Quality check
5. Dispatch

> A job does not need a call — a demo unit has none. A part harvested from a
> unit cannot go back into stock until decontamination is recorded.

## Stock Out
**Spares → Stock Out**

A flat list of what Stores has issued. It was a tab on Pending Dispatch, which
made the right to read the list the same as the right to open the queue — two
questions asked by different people. Everyone who could read the tab can open
the page; from here the two can be granted separately.

## Spare Insights
**Spares → Spare Insights**

Consumption over a window, five ways: biggest consumers, the cover it was fitted
under, the products, the consumable/spare split, and the shape by month.

- Both ends of the window are included.
- Voided lines are excluded — a corrected entry is not consumption.
- A part with no category shows as **Unclassified** rather than guessed at.
- You see only the consumption your role allows, so two people can read the same
  page and see different totals.

## Warranty & Contract
**Cover → Warranty Register · Contract Register**

Two views each: **Entries** (the SA or MC deal with its machines) and
**Machines** (per serial, with the Active / About to expire / Inactive tiles).

Type the period in **months** and the rest fills itself in:

| You type | Warranty | Contract |
| --- | --- | --- |
| 24 months | 2 years · 6 PM visits | 2 years · 4 PM visits |
| 18 months | 1.5 years · 4 PM visits | 1.5 years · 3 PM visits |
| Start 15 Jan | ends 14 Jan the following year | ends 14 Jan the following year |

The two visit rates are **not the same**: warranty is three a year, a contract
is one every six months.

**Machines follow the entry.** A field left empty on a machine follows the
header — change a date on the entry and every machine moves with it. Typing into
a machine's field pins it; ↺ inherit hands it back.

> The end date stays typeable, and editing it changes nothing else — so a
> contract that does not run a whole number of months still works.

On a contract machine line, a **Rate** fills in 18% tax and the total after tax.

## Ownership Transfer
**Cover → Ownership Transfer · Bulk Uploads → Cover**

One row per hand-over. The machine follows the **latest** transfer, so a
back-dated row loaded afterwards does not undo a later one.

- **Leave "From Party" blank** and it is filled in from whoever holds the machine
  now — which is what lets a historical list load in date order.
- If the previous owner genuinely cannot be worked out, the hand-over is still
  recorded with From Party blank. It is not dropped for want of one field.
- **Matched on the OT number and the machine**, so re-importing a corrected
  export updates those hand-overs instead of adding the file again. One OT
  covering several machines keeps a row per machine.
- A row with no OT number is not loaded, and is listed with the reason.

## My Signature
**Your profile**

- **Only you can see it or set it** — not your manager, not an administrator.
- An administrator can ask *who* has saved one, and remove a leaver's, but never
  read one.
- It prints only in the block that names you; anyone else gets an empty block.

> A reproduced image, not a cryptographic signature. It binds nothing to the
> document's contents.

## Tracker
**Tracker**

- Anyone who can open it can add and edit — that is the whole access model.
- Who raised an item is stamped by the system; an edit cannot rewrite it.
- Nothing is auto-deleted. Done and Dropped stay on the list; the page hides them.
- "With whom" names a team somebody can chase, never a tool.

## Reports
**Reports**

- **Consumption Report** — one row per spare booked, with its call and that
  call's latest visit. The two visit dates differ on purpose: *entry* is when the
  register was told, *visit* is when the engineer was there.
- **Not Consumed Against this Call** — parts dispatched or received against a
  call and not fully accounted for: `NOT USED` where none was booked, `SHORT`
  where less was booked than sent. Refused and dropped lines are excluded —
  nothing arrived, so nothing could be fitted.
- **KPI Export** — the workbook's Field_INST tab in its own column order.
  Cancelled calls are excluded entirely.

## The status colours

A call's status is a colour code, identical everywhere a UCN appears, in both
light and dark:

| Status | Colour |
| --- | --- |
| Unattended | RED `#d32f2f` |
| Unsolved | BLUE `#1565c0` |
| Solved — Report Pending | PINK `#c2185b` |
| Solved | GREEN `#2e7d32` |

A UCN whose status is not known renders plain rather than guessing: a wrong
colour on a code is worse than no colour.

---

A count ending in `+` is a **lower bound** — the register is still loading and
the true figure is at least that. A number without one is exact.
