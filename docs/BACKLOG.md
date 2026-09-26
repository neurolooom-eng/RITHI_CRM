# RITHI CRM — Backlog

Living backlog for the Field Service module. Newest decisions at the top of each
section. Shipped items also appear in the in-app **Version History**; this file
tracks what's **done**, **in progress**, and **queued**.

_Last updated: 2026-09-26 (⚠️ THE SCHEDULED REPORTS HAVE NEVER RUN — the
Edge Function was never deployed, so every schedule anybody set has been saved
and silently ignored; same for the daily digest. Four steps, none doable from
this repository, in the 26-Sep entry. Before that: Item Status is the cover on
the COMPLAINT DAY, traced through to the spare —
`_item_status_as_at_the_complaint_date.sql`, read-only; 660 field / 456
installation / 1,065 spares, all 1,065 already approved. Before that: the
Product Database was emptied and reloaded (✅ done, the user's new file is in),
and is now paged NEWEST FIRST, 1,000 a load (v0.9.372) — it had NO ORDER AT ALL.
Before that: 0242 cancels a batch of calls in one go — RUN call_requests.sql,
_status.sql row 185; the BUTTON is not built yet. STILL TO RUN: _status.sql,
_fix_product_database_timeout.sql, sales_contracts.sql then
product_database_2.sql, call_requests.sql, _call_type_out_of_extra.sql.
Before that: ⚠️ A CANCELLED CALL now reads Cancelled, not
"Report pending" — 0226. RUN call_requests.sql, _status.sql row 173. No
re-upload needed: open_state is derived. Before that: the 144 recovered visits are SOLVED — no repair
needed; OPEN: 3,600 of 3,744 bulk-loaded visits carry NO call status, which is
the "Report pending" across the register. Before that: ⚠️ AUDIT TRAIL RE-ARMED — 0225 reverses 0112;
RUN data_integrity.sql (the bundle that carries 0225), _status.sql row 60. Take _backup_before_repair.sql first.
Before that: Drive storage RE-ROUTED to the "Reports" shared
drive, one folder per kind of document — ✅ REDEPLOYED 21-Sep, new /exec baked
in as DEFAULT_URL_VERSION 11. No SQL.
Before that: RCA on 4,222 calls Solved with no visit — the
"Close call" button, 5-15 Sep; plus a proper Excel/CSV export. Before that:
QUEUED: Product Database 2.0 as the primary product
list — what it involves and the four decisions it needs. Before that:
⚠️ NEW REPORT Solved Without a Report — RUN reports.sql,
_status.sql row 172. Before that: Product Database 2.0: a drawer per machine with its
references as working links. Before that: ⚠️ 0220 refused EVERY reader including admins —
0221 repairs it and removes the gate; RE-RUN product_database_2.sql. Before that:
Product Database 2.0 was TIMING OUT and is now
materialised — RUN product_database_2.sql, _status.sql row 170. Before that:
Daily Complaint Review Register (R/SER/35): renamed,
two master tabs removed, and the Review Desk loads every call instead of stopping
at 500 with no button. Before that: Product Database 2.0 says WHY it is empty on the
screen itself, and only claims what it measured. Before that: the missing view
grant; 0148 no longer re-adds a constraint 0152 deletes. Before that: the Consumption upload files the visit from the file,
so a bulk load no longer stops on row 1 — CLIENT ONLY. Before that: ⚠️ 0217
restores three rules 0210 dropped from the
spare line guard — RUN Spare_1.sql; data.view_all for every role but three;
the re-upload probe no longer needs 0215 to run;
how to fill the two visit columns. Before that: default report columns, and the
Visit UID the picker could not offer — CLIENT ONLY, no SQL. Still to run: 0214 and 0215, `_status.sql`
rows **166** and **167**, bundle `HandStock_X.sql` at the repository ROOT.
0207-0213 APPLIED)_

_Previously: 2026-09-06 (bundle replay safety; see the top of In progress) ·
2026-09-02 (spare reconciliation shipped and applied; live project fully caught
up)_

---

## 2026-09-26 — ⚠ The scheduled reports have never run, and never could have

*"The scheduled reports are also not running"* — reported from use.

**NOT A FAULT TO DEBUG. A DEPLOYMENT THAT WAS NEVER DONE.** The screen works,
the schedules are stored correctly, the due-time arithmetic is right — and
nothing has ever come to collect them. `supabase/functions/scheduled-export`
has never been deployed, so no mail has ever been sent. Every schedule anybody
has set has been saved and silently ignored.

It was already recorded, which is the uncomfortable part: `REQUIREMENTS.md`
marks NAR-004.9 to .19 **"SPECIFIED AND UNVERIFIED"** with the words *"NOTHING
IS SENT UNTIL THAT IS DONE"*, and the two deployment items below have been in
this backlog for days. What was missing was anyone saying it to the person
setting the schedules. **A screen that accepts a setting nothing acts on is
worse than one that refuses it**, and that is the defect here rather than
anything in the code.

**THE SAME IS TRUE OF THE DAILY DIGEST** — built, never deployed, so no
off-database archive of the audit trail exists.

**FOUR STEPS, none of which can be done from this repository** (they need the
Supabase CLI holding the project keys):
1. A Resend API key, domain verified.
2. `supabase secrets set RESEND_API_KEY / EXPORT_FROM / EXPORT_TO /
   EXPORT_SECRET`, then
   `supabase functions deploy scheduled-export --no-verify-jwt`.
3. RUN `call_requests.sql` — it carries 0227 and 0228 (the tables, the guards,
   `due_export_schedules()`).
4. `schedule_scheduled_export.sql` with `<PROJECT_REF>` and `<EXPORT_SECRET>`
   filled in — the fifteen-minute poke.

**WHY THE RECIPIENTS ARE NOT IN THE APPLICATION, since it will be asked again:**
an earlier design kept the destination in a settings row and was refused as an
exfiltration primitive. It is a nightly copy of every customer, serial and
contract, and a destination an administrator can edit is one that can be
redirected silently with nothing on any screen looking different the next
morning. What and when are data; who receives it is a deployment secret.

---

## 2026-09-25 — Item Status: the cover on the complaint day, traced to the spare

*"update Item Status in Calls based on the Status on the date of Complaint --
this is for both Field and Installation Call. In Installation call, it has to
be WGP always."* … *"trace the item status back to Spare request as well."*

One chain: the machine's dates → the FIELD call as at its complaint date →
INSTALLATION always WGP → the SPARE REQUEST from its call.
`_item_status_as_at_the_complaint_date.sql`, read-only until one word changes.

**THE RULE IS NOT THE ONE ALREADY IN THE DATABASE.** Every existing cover rule
here asks only `end >= current_date` and never looks at the START — fine for
"covered today", wrong when asked about an older date, and wrong in the
direction that always grants cover. This checks both ends. On a fixture, a
complaint dated between the warranty ending and the contract starting reads
OGP where the old rule says AMC.

**MEASURED ON THE LIVE REGISTER:** 660 field calls change, 456 installation
calls, 1,065 spare requests — and **all 1,065 of those are already approved**,
so "correct only the ones in flight" was a no-op. Four of the five caveats came
back zero (no call lacks a complaint date; every machine resolves; no period
has an end without a start).

**A FALSE ALARM, RETRACTED.** A check for whether the spare STAGE derives from
item_status answered "YES — changing it moves settled lines", and it was wrong:
it grepped `pg_get_functiondef`, which contains the argument NAME. The body is
the test (`prosrc`), and the body does not read it. Disproved properly on a
DISPATCHED request: status moved WGP → AMC, stage stayed Dispatched, remarks
untouched, an existing `extra` key survived. **Test the body, never the
definition.**

Each corrected request records WHY in `extra` — from, to, when, and that any
approval on it was granted under the previous status and has NOT been
re-opened. The note goes in `extra` rather than `remarks` because remarks is an
engineer's own text. The audit trigger records the change; only this records
the reason.

**PENDING:** the user is correcting and uploading it themselves rather than
running the SQL. Item Status is uploadable on all three registers — Calls
(keyed UCN, needs `calls.edit.customer`), Spare Request (keyed **OR number**,
not UID), Product Database (keyed machine_key). And the repair fixes HISTORY
only: new calls still stamp from the Product Database, so a forward-stamping
rule is still owed.

---

## 2026-09-25 — Product Database: emptied, rebuilt, and paged in an order

*"delete all records in product database and re-build through bulk import"* —
asked for after being told what it costs, confirmed, and done. The reload
landed: *"i uploaded the new file and it seems to be working."*

`_rebuild_product_database.sql` backs up to `products_backup_<stamp>` in the
same transaction before deleting, with RLS on and no policies. Not hedging the
decision: **nothing references `products` by foreign key and it has no delete
guard**, so without a copy the rows are simply gone. It also lists the
model+serial pairs that calls and spares actually reference — the set the
reload file has to bring back — because every register finds a machine by
serial as TEXT, so the delete orphans lookups silently rather than erroring.

**AND THE REGISTER WAS PAGED WITH NO ORDER AT ALL** (v0.9.372). Asked for a
sort; found `sbSearchProducts` built a `.range()` read and never called
`.order()`. Between one page and the next the database was free to return rows
in any order — "Load more" could repeat a machine and drop another, and the
result looked complete. Now `created_at desc, id desc`; the tiebreak matters
because a full reload writes every machine in the same instant.

**1,000 a load, not 2,000** — the user's call, and the right one: PostgREST
caps a response there whatever the range asks for, so 2,000 returns 1,000 and
the "full page?" test then hides Load more on a register with thousands left.

**WHY THE OLD DATES KEPT COMING BACK, reproduced:** `sync_product_cover()`
rebuilds the machine from the sale and contract registers with
`coalesce(new, old)` on every date — **it can only add a value, never remove
one**. A correction made in the Product Database survives until the next edit
to that machine's paperwork, then the register writes the old date straight
back. Proved by running it: cleared → null → any later edit → back.

**PENDING:** the nightly refresh. `refresh_product_cover()` already exists and
sets item_status with no coalesce, but it ALSO rewrites the dates with one — so
scheduling it as-is would undo hand corrections every night. It needs an
item-status-only variant first.

---

## 2026-09-25 — call_report and reports do not count the same thing

*"there are 2 reports - call_report and reports ; the count is different in
both. Analyse and store it in memory"* — analysed, and written into CLAUDE.md.

`reports` is ONE ROW PER VISIT (0001 created it `unique (ucn)`; **0002 dropped
that** and keyed it on `uid`). `call_report` is ONE ROW PER CALL. They differ in
BOTH DIRECTIONS AT ONCE, so "is one bigger?" answers nothing: several visits on
one call, calls with no visit at all, and visits whose UCN matches no call.
**Only the last is a fault** — `reports.ucn` has no foreign key, so a mistyped
UCN is a visit in no register and no call status. And they are read under
DIFFERENT RLS besides.
`_why_do_the_two_report_counts_differ.sql` reconciles them line by line.

---

## 2026-09-25 — PM: the open-call count, and what the two exports proved

*"i have about 1000+ call difference in the Count of pending"*, then two
exports.

**THE EXPORTS ARE NOT AT FAULT** — checked row by row: the pending list is
exactly the 1,632 `Open` rows of the 7,038-row register, every Solved row
carries a visit date, every Unattended row carries none, no duplicate UCNs.
Nine rows are junk (blank UC Number, `#VALUE!`) and cannot load, UCN being the
one required column.

The database says 3,706 open against the export's 1,632. A call's state comes
from its LATEST VISIT, so a PM call whose visit was never loaded reads
Unattended however firmly the register calls it closed — 1,722 such calls
account for the whole excess.

**A DATE CUTOFF WAS TESTED AND REJECTED**: the best-fitting cutoff misses by
2,195 rows, and **September is NEGATIVE** (310 unvisited where the file says
391). A negative cannot be missing visits, so the database's PM calls are not
the same 7,038 rows as this export.
**BLOCKED** on rows 1, 2 and 4 of `_why_are_pm_calls_still_open.sql`.

**SEPARATELY, AND NOT THE SAME THING:** Pending Calls loads 2,000 and stops,
and states a bare number in its banner and its four state tiles with no `+`.
That is the "1000+ difference" as seen on screen. NOT YET FIXED.

---

## 2026-09-24 — Cancel a batch of calls in one go (0242)

*"Cancel all these calls in 1 Go with Reason as 'Duplicate Call'"*.

`cancel_calls(text[], text)` is a SECURITY INVOKER loop over `cancel_call()`
(0108) and adds no new power — the permission, the empty reason, the unknown
UCN and the already-cancelled one are all still refused by the function it
delegates to. Each cancellation runs in its own subtransaction, so twenty are
not thrown away by one somebody already cancelled. Capped at 500.

**THE SUITE ASSERTS WITH `raise exception`, NOT A PRINTED GRID**, because the
runner judges ERRORS and a grid nothing checks is not an assertion. Worth doing
rather than assuming: a mutation that made the function write its own UPDATE
instead of delegating left the printed grid reading ok=true and the suite
passing. Five mutations run, all caught.

**PENDING: the button.** The database half is done; Field Calls still cancels
one call at a time through its own prompt.

---

## 2026-09-24 — KPI Export: a date Excel accepts (v0.9.370)

*"in the KPI Export under Reports, the Call Registration Date is not recognized
by Excel. Update all the Date Fields in the KPI to be compatible as a Date Field
in Excel."*

**THE COLUMN NAMED IS THE ONLY ONE WITH A TIME ON IT**, and that is the whole
diagnosis. The export was CSV-only, so every date in it was text for Excel to
parse: it manages `17-Sep-2026` and it does not manage
`18-Sep-2026 08:51:02`. **There is no spelling of a date in a CSV that every
Excel reads** — the FORMAT is the limit, not the wording, and re-wording it
would have been a guess dressed as a fix.

**So the KPI Export now offers a WORKBOOK**, where a date is a number plus a
format and nothing is parsed. All nine date columns arrive as real dates.

**THE TRAP WAS PRE-FORMATTING.** `toKpiExportRow` renders dates for the CSV, and
handing its output to the workbook writer would have produced text — because
`excelSerial()` uses the STRICT ISO test on purpose (it once turned the part
code `MP-010` into serial 37165), so `24-Sep-2026` is not a date to it.
`toKpiCellRow` passes the RAW value and lets `xlsxCell` decide, by VALUE and
never by column name.

**The CSV is unchanged and still offered**: it is what pastes into the KPI
workbook column for column.

Numbers stay numbers (Attended in Days, Solved in Days, TTA, TTS, Pending Days)
and a Call Number of all digits stays text with its leading zeros — both halves
of the rule, both asserted.

**Proved by building the workbook and reading the bytes**: the registration cell
is `s="1"` with a bare `<v>`, the eight date columns are `s="2"`, and neither is
`inlineStr`. Four mutations, all caught — including "pre-format the workbook's
dates", which is the mistake that was there to be made.

`npm run validate` 101/101 suites, 22/22 checks.

## 2026-09-24 — DCCR mirrors itself to a Google Sheet, from CallReg.gs (v0.9.369)

*"The DCCR Register should be written to the Google Sheet ... Tab 'DCCR_Mirror'
; Frequency : every 6 hrs ; Starting today by 10PM"*, then *"DCCR - Update the
CallReg google script"* — which settles the credential question I had put to
the user: it goes in the Apps Script, not in a second Edge Function.

**WHY THERE.** A browser cannot run on a schedule. The register is in Supabase,
the destination is a Google Sheet, and the only thing that can sit between them
on a timer with rights to both is this script.

**THE COLUMN LIST IS A COPY, AND A CHECK COMPARES IT.** Apps Script cannot
import TypeScript, so `DCCR_COLUMNS` in the .gs duplicates
`DCCR_EXPORT_COLUMNS`. `check:ui` compares them key for key and heading for
heading — the `SEE_ALL_ROLES` / `coverCode()` treatment, for the same reason.
**It earned its keep on its first run**, catching `REVIEW STATUS` where the app
says `Review Status`. The blank-on-purpose columns are compared too, and that
assertion was wrong at first: it checked one direction only, so the mirror could
FILL a column the app leaves empty and pass. It derives the app's blanks by
RUNNING `toExportRow` over a row where every field carries a value, and compares
both ways.

**FOUR DAILY TRIGGERS, NOT `everyHours(6)`.** That one counts from whenever the
trigger was created and cannot be anchored to a clock, so "from 10 PM" is
22:00 / 04:00 / 10:00 / 16:00 as four `atHour().everyDays(1)` triggers.
`installDccrMirror()` deletes its own before creating, so running it twice does
not double the schedule. Apps Script fires within about an hour of the stated
one — stated, not glossed over.

**THE CREDENTIAL, AND THE RECOMMENDATION MADE IN CODE.** It tries
`DCCR_EMAIL`/`DCCR_PASSWORD` FIRST — a real Supabase login made for this job, so
the mirror reads UNDER row-level security as one named account and a leaked
property is worth what that one account is worth. `SUPABASE_SERVICE_KEY` is the
fallback, says in its own comment that it bypasses RLS entirely, and the status
tab records which of the two was used on every run. The web app has never
carried the service key and still does not.

**Written whole each run, never appended** — a review answered today changes a
row that already exists — in ONE `setValues`, because four thousand rows written
cell by cell hits the six-minute ceiling. Cleared first, and only the range that
had content, so a shorter run leaves no tail of the previous one reading as live.
Dates are written as DATES with the column formatted `dd-mmm-yyyy`.

**⚠ I CANNOT TEST IT.** `script.google.com` is blocked from this sandbox. The
script is written and its rules are checked; it has never been executed. Fire
`?action=dccrmirror` once by hand before trusting the schedule.

Setup is four steps and they are in the comment block at the top of the DCCR
section of `apps-script/CallReg.gs`. **A change to that file is not live until
the Web App is redeployed.**

`npm run validate` 101/101 suites, 22/22 checks.

## 2026-09-24 — A download from a half-loaded table warns first (v0.9.368)

*"if there is more data and user is downloading it give a pop up disclaimer
that there are more data and you are exporting only a partial data. If table is
loaded fully (No load more option) then don't show this disclaimer. People keep
saying data is missing when they download without ensure if all the data is
loaded or not."*

**THE COMPLAINT IS ABOUT EVIDENCE, NOT ABOUT A DIALOG.** Every register loads in
pages and the SCREEN is honest about it — the count carries a `+`, a Load more
button sits beside it. The FILE carries neither. Opened in Excel a day later it
is just rows, with nothing in it anywhere to say the register had more, so the
reader concludes the system is missing data and reports it as such.

**ONE PLACE, NOT THIRTY-FIVE.** `csvExport()`, `xlsxDownload()` and
`xlsDownload()` are the three writers; the rule sits where the bytes are
produced. This project has the scar for the other way round — `allRows()` went
into one of thirteen call sites and the other twelve came back a year later as
a new bug.

**AND THE ANSWER IS A REQUIRED ARGUMENT.** 48 call sites across 35 files now
have to say what they know: `COMPLETE`, `partial(more)` or
`cappedAt(rows.length, cap)`. Optional, it would be the thing the next screen
forgets — silently, which is the fault itself in a new place. `check:ui`
refuses an inline literal too, so the answer has to be one of the three
sanctioned words; that is the discipline `FacetChips` already carries for
`more`.

**`cappedAt` EXISTS BECAUSE SOME SCREENS CANNOT TELL.** Stock Transfer reads
`listStockTransfers(1000)`, Pending Dispatch 2,000, the FFR register 5,000 —
no Load more, no `more` state, just a cap. A read that comes back FULL is the
signature of a truncation, not of an exhausted table, so those answer "there may
be more" rather than claiming completeness. That is a real gap those screens
have, now visible at the moment it matters.

**THE POP-UP SAYS THREE THINGS**, in the order somebody needs them: what will be
in the file, what is missing, and what to do — press Cancel, Load more until the
button disappears, download again. It never names a total, because the screen
does not know one; inventing one here would be the same fault in a new place.
Exporting anyway is allowed: somebody taking the first two hundred rows of a
filtered view is doing nothing wrong, and a refusal would make the sensible case
impossible in order to serve the careless one.

**⚠ AND A CORRECTION TO YESTERDAY.** The checks written for the Hand Stock
Report (v0.9.367) had been APPENDED to `check-ui.ts` **after its
`process.exit()`** and had never run once. Everything they assert passes — so
nothing shipped wrong — but the claim "`check:ui` runs them" was false for one
release. Moved above the exit, and every one of them mutation-tested properly
this time. The same slip had swallowed the `.xls` byte-level assertions.

**One more assertion was a lie of the `indexOf` kind**: "csvExport asks before
it builds the file" was `indexOf('mayExport') < indexOf('new Blob(')`, and a
MISSING needle is `-1`, which is less than everything. Deleting the guard left
the check green. It tests for presence first now — found by mutating it, which
is the only way that shape ever is.

`npm run validate` 101/101 suites, 22/22 checks.

## 2026-09-24 — Hand Stock Report (v0.9.367)

*"Add a Hand Stock Report - Default access to Admin/Super Admin, Rest of the
Access I will select from Roles & Permissions. Add this under Reports. Ensure
the Roles & Permission page is update. Default Load as to be 1000 and Auto Load
till all the data is displayed and then Enable Download. Name the Export -
HandStock_DateTime.csv / .xlsx / .xls"*

**`/handstock-report`, in the Reports group and NOT under `/exports`** — every
`mod:/exports/...` key inherits from `mod:/exports`, so filing it there would
have handed it to every role that can already open Reports, which is the
opposite of what was asked. Same shape as Feedback Without a Report.

**ALL THREE THINGS MOVED TOGETHER** (the standing rule): `MODULES` + the menu,
`PERM_TREE` (Reports header, last, matching the menu's order), and **0241**
merging the key into `app_roles` — without which the page ships, the menu entry
exists, the tick is in the code, and no role can open it. That has happened four
times here.

**AND THE GRANT WAS WRONG THE FIRST TIME.** 0241 granted `admin` alone, which is
the literal reading of the ask — and `_status.sql` row 114 went **red** on the
validation run. That row asserts a PROPERTY: Technical Support holds every
module key the admin holds, which is what that role IS ("Mimic Super Admin -
But with Read Only"). An administrators-only page skipping it breaks the role
silently, which is precisely what the row exists to catch. Granted to both now,
with the reason written into the migration. Zoho Migration is left alone — no
check requires it, and the rule here is not to touch a role that was not named.
Super Admin needs no grant at all: it is not a role but a row in
`app_super_admins` that overrides every check.

**IT READS `handstock_balance`, the view the Hand Stock register reads.** Hand
stock is DERIVED and never stored, so a report with a query of its own could
disagree with the screen people work from — the one outcome worth ruling out by
construction.

**PAGES OF 1,000, STOPPING ON A SHORT PAGE.** Not a preference: PostgREST caps a
response at a thousand rows however large the range, so a bigger page is the
line that HIDES the truncation. A full page says nothing about whether another
exists, so the loop can only end on a short one. Each page renders as it lands
and a run token stops a mid-load Refresh from interleaving two reads.

**THE DOWNLOAD IS REFUSED UNTIL EVERY PAGE IS IN**, which is the user's own
instruction and the right rule here specifically: a stock file is RECONCILED
AGAINST, so a partial one is not a shorter answer but a wrong one. Elsewhere a
`+` makes a partial count honest; there is no `+` for a spreadsheet somebody is
subtracting from. The button is disabled AND the writer refuses.

**THE COMPONENTS ARE EXPORTED BESIDE THE TOTAL** — opening, stock out, consumed,
transfers both ways, returned — because `on_hand` alone cannot be checked by
anybody. A negative balance is inverted against the page rather than tinted
("highlight" means CONTRAST here).

**THE `.xls` IS SPREADSHEETML 2003, and that is a stated trade-off**, not a
silent one. The old BIFF binary is a compound document and a record stream, and
a half-right one is a file Excel refuses — worse than not offering it. The usual
substitute, an HTML table named `.xls`, loses every type, which this project has
measured the cost of twice (Line ID sorting 1, 10, 100, 2; a SUM over QTY
answering 0). SpreadsheetML keeps `Type="Number"` and `Type="DateTime"`. What it
costs is one warning in Excel 2010+ about the extension, and the button's
tooltip says so rather than leaving somebody to wonder. Proved by reading the
bytes: a part code of `0012345` is still a string with its leading zero.

**FILE NAME**: `HandStock_24-Sep-2026_181503.<ext>` — the house date format,
month NAMED, with the clock stripped of the colons a Windows file name cannot
carry. Local time, because the name answers "when did I pull this".

The paging rule, the file namer and the column list are PURE and live in
`lib/handstockreport.ts` rather than in `supabase.ts`, for the `paging.ts`
reason; `check:ui` runs them, including a workbook built and read back.
URS-077 / FRS-091 / OQ-79. `npm run validate` 101/101 suites, 22/22 checks.

## 2026-09-24 — The whitespace theory was WRONG, and the probe that replaces guessing

`_which_product_names_carry_stray_spaces.sql` came back **all zeros** on the
live register. Not one product name carries a stray space, in `products`,
`sale_items` or `contract_items`. **My diagnosis was wrong**, and v0.9.366 —
matching the product name exactly as the picker offered it — fixed a real
asymmetry between that read and every other one, but it is **not** what is
wrong with Extend XT.

I had reproduced the whitespace fault on a FIXTURE I built. Reproducing a fault
you invented proves the mechanism is possible, not that it is the one happening.
The probe is what told the difference, and it should have come first.

**`supabase/apply/_where_is_this_machine.sql`** is the replacement for the next
guess: read-only, two values to edit at the top, and it answers WHICH REGISTER
holds the machine rather than assuming one. The Call Request's Product box and
its serial search both read ONE table — `public.products` — while the Warranty
Register, the Contract Register and Product Database 2.0 read others, so a
machine can be plainly visible on one screen and invisible to the request form
with nothing broken in between.

Four verdicts, each exercised against a database before shipping:

* the machine is in the install base → the fault is a SPELLING, and sections 2
  and 3 print both spellings in brackets;
* **a different machine carries that serial** → the one being looked for is not
  there under this model;
* **sold but never added to the install base** → the Warranty Register has it
  and `products` does not, which is exactly what **0237** repairs, backfill
  included. Row 10 counts how many machines of that product are in that state,
  because one serial is an example and the decision is about the product;
* not in any register under that serial.

**The first draft judged on the SERIAL ALONE and got it wrong on the first real
input** — it reported "the machine IS in the install base" while what was
actually there was an ORION-G with the same serial, and the EXTEND XT was
missing. That is this project's oldest rule (a machine is its MODEL and its
SERIAL; eleven are numbered 219) failing in a file written to enforce careful
thinking. Rows 4 and 5 now separate "this model and this serial" from "other
models carrying that serial", and the verdict tests them in that order.

Unchanged, it prints `CHANGE-ME-PRODUCT` / `CHANGE-ME-SERIAL` and says so in
row 1 rather than returning a confident grid about nothing.

No version bump: this adds a diagnostic and changes no behaviour.

## 2026-09-24 — ⚠ "Extend XT only": the dropdown and the search named the product differently

*"This happens in Extend XT product only."* — and the single word **only** is
what identifies the cause, because a fault in the serial search would not pick
one product out of forty.

**THE PRODUCT NAME, NOT THE SERIAL.** The Product box is filled from
`product_register_names`, which groups `products.item_name` and hands it back
VERBATIM. `sbSearchMachines` then asked for `item_name = <that name>.trim()`.
A register row stored as `EXTEND-XT ` therefore put `EXTEND-XT ` on screen and
`EXTEND-XT` on the wire. **Measured: the dropdown says 2 machines, the equality
finds 0.** Empty serial box → no machine → no customer → CR-011 refuses the
request. Every other product is untouched.

**AND THE TRIM WAS THE ODD ONE OUT, not the convention.** `sbSearchProducts`,
`sbListMachinesForParty` and `listPartyItems` all match the name as given; this
one call trimmed. Removed, and `check:ui` refuses it coming back — mutation
tested both ways (put the trim back; let a whitespace-only product filter).

**THE DATA IS NOT REPAIRED IN CODE, DELIBERATELY.** A name with a trailing space
is two products to Postgres and one to a reader: every `group by item_name`
splits silently and the picker shows an apparent duplicate. That is worth
correcting, and it is a decision with consequences, so it gets a probe rather
than an `UPDATE` written on a guess —
`supabase/apply/_which_product_names_carry_stray_spaces.sql`, read-only.

**IT DISTINGUISHES TWO KINDS AND CHECKS THE CLAIM ON THE USER'S OWN DATA:**

* **a plain space at either end is free to fix** — `machine_key` is generated as
  `lower(btrim(item_name)) || '|' || lower(btrim(serial_number))`, so it ALREADY
  ignores the ends: trimming leaves every key byte for byte the same. Row 4
  proves that against the database rather than asserting it.
* **a non-breaking or zero-width character is not** — `btrim()` does not remove
  U+00A0, so it IS part of the key, and sweeping it MOVES the key. Row 5 counts
  the machines that would then collide with the unique index.

Both branches were exercised by building the cases: a clean twin under the
trimmed name, and a real-space machine sharing a serial with an NBSP one. The
first draft of the probe reported a name as **its own** clean twin and counted a
self-match as a collision; rewritten around one `clean` expression so a row in
the odd set can never satisfy the twin test.

Shipped in **v0.9.366**. No SQL needed for the fix. CR-005a added.

## 2026-09-24 — "INXT 0105" — the serial that ENDS with what you type

**Asked the same day yesterday's fix shipped**: *"I have a user case where
serial number is INXT 0105, will that populate if I type 105?"* Measured rather
than reasoned about, and the answer was **no**.

That fix guaranteed the serials BEGINNING with the term (a string sorts before
everything it is a prefix of, so the prefix read cannot cut the exact match
off). `INXT 0105` only CONTAINS `105`, so it landed in the contains read, was
sorted alphabetically among **1,046** machines whose serial contains 105, and
came back at **rank 146** — past the fifty, never offered.

**A THIRD READ, `%term`.** A great many serials here are a letter code, a space
and a number, and what somebody standing at the machine reads out is the number,
so "ends with what was typed" is not symmetry — it is the common case. FOUR
serials end in `105` against 1,046 containing it, so that read cannot be crowded
out. Rank tiers are now begins-with, ends-with, contains.

**AND THE CAP UNDID THE FIX ONCE BEFORE IT SHIPPED.** Sorting by tier and
cutting at 50 put `INXT 0105` at **rank 52** — one place past the cap — because
120 serials in the fixture began with `105` and filled it. `rankSerialHits` now
applies the limit PER GROUP: every non-empty group gets an equal share, and the
leftover goes to the closest groups in order. Tier order decides what comes
first; it must never decide what is reachable.

**End to end, against a database, through the real function:**

| typed | rows from the three reads | rank of INXT 0105 |
|---|---|---|
| `105` | 50 | **24** (under the 23 serials that begin 105) |
| `0105` | 2 | **2** |
| `INXT 0105` | 1 | **1** |

and in the adverse fixture — 120 serials beginning `105` — rank 49 of 50, still
offered where it was absent before.

**A limit that is stated rather than hidden**: a fragment buried in the MIDDLE
of a serial, where more than fifty machines match it, can still sit low. Typing
more characters is the answer and the picker's footer says so.

Five more mutations, all landing, all caught — including "apply a flat cap
again", which is the exact mistake made and caught here. CR-031 rewritten.

Shipped in **v0.9.365**. No SQL. `npm run validate` 101/101 suites, 22/22 checks.

## 2026-09-24 — The serial list was sorted by nothing, so the machine you typed was not offered

**Reported with a screenshot and a diagnosis** (*"I could reproduce this issue.
If the user doesn't properly select from the list [which is not sorted as per
the closest match] and simply moves on to the next field then this happens even
though the product and serial number combination is very much available"*): a
New Call Registration Request for **ORION-G serial 105**, refused with *"Call 1:
that serial is not on the register, so no customer came with it."*

**THREE FAULTS, ONE SYMPTOM.** Each one on its own gives a row a serial with no
customer, which is the only thing `machineRowProblem()` can see.

**1. The search named no order.** `sbSearchMachines` was a single
`ilike '%term%'` with `.limit(50)` — no `order`, which breaks this project's own
rule that every capped read names one. Measured on a fixture where **925**
machines carry a serial containing `105`: the machine actually numbered 105 came
back at **rank 19 of 50**, decided by the physical order of the rows. Past the
cap it is absent, and a machine that cannot be picked cannot name its customer.
Fixed with two ordered reads run together — `term%` and `%term%` — and the
prefix read is what carries the guarantee: **a string sorts before everything it
is a prefix of**, so the serial typed is the first row of it and the cap can
never remove it. CR-031.

**2. A stale search wiped the machines behind the list.** PickList debounces but
does not cancel a request already sent, so two can be in flight and the slower
one lands last. PickList guards its own rows (keyed to the query that produced
them); the module's `machineHits` map was not guarded at all, so clicking a row
found nothing behind it. Hits are MERGED now, keyed on model + serial: a machine
does not stop existing because a later search did not mention it.

**3. The form refused on the wrong evidence.** "That serial is not on the
register" is a claim about the REGISTER; what the form actually knew was that
the row had no machine attached IN THE BROWSER. `resolveMachines()` asks the
register by model and serial on submit, before the rule runs. An ambiguous
serial still resolves to nothing — `sbProductBySerial` returns null rather than
guessing, because eleven machines are numbered 219 — so a genuinely unanswerable
row is refused exactly as before. CR-011 rewritten.

**THE RANKING IS A PURE FUNCTION** (`rankSerialHits` in `lib/callrequest.ts`),
not a line inside `supabase.ts`, for the `paging.ts` reason: that module reads
`import.meta.env` and no check can import it. `check:ui` runs it on real inputs.

**AND THE FIRST VERSION OF THAT TEST PROVED NOTHING.** It had three tiers —
exact, prefix, contains — and removing the exact tier altogether changed no
result, because a string already sorts before everything it prefixes. Two of
five mutations went uncaught. The tier is gone (a tier no test can distinguish
is not doing anything) and the cases were rewritten around `0105`, which
contains `105` and sorts *before* it — the one shape where the ranking is
observable. Eight mutations now, all landing, all caught.

Shipped in **v0.9.364**. No SQL. `npm run validate` 101/101 suites, 22/22 checks.

## 2026-09-24 — ⚠ The Product Database search timed out AGAIN, and this time the fix was already written

**Reported from use**, by a Commercial user (VALARMATHI) searching the install
base for `1691`: *"Search failed: canceling statement due to statement
timeout"*, with the PREVIOUS search's rows still on screen underneath. That is
the worst shape a failure can take here — it reads as a broken register rather
than a slow one, and the rows below the banner look like the answer.

**The cause is 0236 and it was never applied**, because applying it meant
running `sales_contracts.sql`, which re-executes seventeen migrations and
deadlocked against the live app twice. So the fix has been sitting in `main`
since yesterday while the screen went on failing.

**MEASURED, at the register's real size**, on a throwaway Postgres loaded with
20,002 machines, 40,006 contract lines and 15,004 installation calls, read
through RLS as a Commercial user against the 0239 view:

| the read | bare policies | InitPlan policies |
|---|---|---|
| the search she typed | 7,695 ms | **184 ms** |
| the register's opening page | 7,892 ms | **218 ms** |
| a party contains-match | 7,984 ms | **1,058 ms** |

Supabase stops an `authenticated` statement at **eight seconds**, which is why
7.7 seconds is not "slow" but an empty screen.

**`supabase/apply/_fix_product_database_timeout.sql`** is the new deliverable:
0236 and nothing else, in a file small enough to paste, with
`lock_timeout = '4s'` so it gives up rather than deadlocking, idempotent, and
ending in a grid that reads the policies back out of `pg_policy` and says which
are still per-row. ⚠ **RUN IT.**

**I nearly shipped the opposite fix.** The view builds the contract match and
the installation-call match as two full passes, so the obvious idea was a
LATERAL that looks each machine up through an index instead. Built it, proved
it returns byte-identical rows on all 20,002 machines including six adversarial
cases (two contracts on one machine, a tie on the end date, a blank product
name, a live contract with no type, a cancelled call, a call naming a different
customer) — and then measured it: **115,477 ms** against the hash join's 7,695.
Fifteen times WORSE, under exactly the RLS shape the live project has. That is
0235's lesson a second time, and the only reason it did not ship is that it was
measured at the register's size before anybody was told it was faster.

**Two things found while measuring:**

- **The "Any status" picker on the Product Database did nothing on this
  database.** `ProdFilters.status` has existed since the sheet era and
  `searchProducts()` still forwards it to the Apps Script bridge, but
  `sbSearchProducts` never read it — so picking OGP returned the whole register,
  which quietly tells a reader every machine is OGP. It is `.eq('item_status')`
  now, which is only askable at all because 0235 made that column computed.
- **`_status.sql` row 181 could be fooled.** Its test was *contains
  `SELECT has_perm`*, which passes a policy with one branch wrapped and the
  other left bare — exactly what a later migration editing one branch produces,
  and still 7.7 seconds. It COUNTS the calls now, reads `with check` as well as
  `using`, and was proved against a policy built that way on purpose: the old
  test said YES, the new one says NO.

**A timeout no longer reads as a failed search.** `isTimeout()` in `dberror.ts`,
wired into `loadFailure()` and into the Product Database's own banner: it says
what to narrow and still prints the database's words underneath, which is the
project's rule about never overwriting the real message with a hint.

Shipped in **v0.9.363**. `npm run validate` 101/101 suites, 22/22 checks.

## 2026-09-24 — The timestamp rule, and a survey of which tables keep one

> *"Record the Timestamp in Ownership Transfer as well. Ideally all the tables
> should record the Timestamp, and every Table should have a Key on its own."*
> *"Applicable to All Tables ; Timestamp - Capturing the Transaction Date and
> Time in this format dd-mmm-yyyy hh:mm:ss and this should be compatible as a
> DateTime / Long Date field in Excel."*

Written into `CLAUDE.md` as a standing rule. **Two of its three parts were
already true everywhere** — `formatDayTime()` is the one display formatter and
`excelSerial()`/`xlsxDate()` already export a serial plus a format rather than a
string. What was NOT true is the first part: that every table records when the
transaction happened.

**0240 fixes the case that was actually costing something.** `transfer_date` on
`ownership_transfers` is a DATE, and 0238's rule is "the party is whichever of
the sale and the transfer is LATEST" — so a transfer recorded at 2 pm on the day
of a sale entered that morning compared as MIDNIGHT and lost. 0238 papered over
it with a tie-break (a transfer dated the same day wins, since a machine cannot
be transferred before it is sold), which is right for that case and a **guess**
for the reverse one: a machine transferred in the morning and sold on in the
afternoon read as transferred. `transferred_at` makes the comparison exact.
Proved both ways within a single day.

`transfer_date` is kept and is not derived from it: it is the day the machine
changed hands, `transferred_at` is when the system was told, and they routinely
differ.

### The survey — and a correction to it

| | |
|---|---|
| tables | 77 |
| **no `created_at`** | **40** |
| only a synthetic `id`, no natural key | 22 |

**My first survey said 48 lacked a key and it was wrong**: it counted only
unique indexes that are not the primary key, so a table whose natural key IS its
primary key — `product_master`, keyed on `product_code` — read as keyless. The
number is 22.

**Most of those 22 are correctly keyless**: `audit_log`, `record_audit`,
`ffr_history`, `notifications`, `call_vigilance_changes`, `password_resets`,
`export_runs`, `inst_call_repair_log` are append-only logs where every row IS a
distinct event, and `spare_dispatch_lines`, `stock_transfer_lines` and the three
`indoor_job_*` tables are child lines that may legitimately repeat. Adding a
natural key to those would be wrong, not thorough.

**Where it is a real gap**, in order: **`user_directory`** (nothing stops the
same person appearing twice, and the User Master is "the only place I can map
and configure"), `pending_registrations`, `kb_articles`, `documents`,
`tracker_items`, `export_schedules`, `complaint_suggestions`.

**Not done, deliberately.** Adding 22 keys and 40 timestamp columns blind would
be 62 changes nobody asked for, some of them wrong. Each needs its own answer to
"what makes a row the same row?", and on a table with existing data a unique
index fails loudly if that answer is wrong — which is the good outcome only if
somebody is expecting it.

---

## 2026-09-24 — A machine belongs to its latest owner, and so does everything attached

> *"What should be displayed is entirely based on the Timestamp of when the change
> was done ... Contract has to match the product, serial no, party.. Same with
> Installation calls ... and party is decided by sale entry or ownership transfer
> whichever is latest."*

Shipped in v0.9.361. **⚠ RUN `sales_contracts.sql`, then `product_database_2.sql`.**
`_status.sql` row 183.

**The second sentence is the mechanism for the first**, and reading it that way is
what makes this safe. A re-sale does not DELETE the previous owner's contract and
installation call — they stop MATCHING. Nothing is destroyed, the registers are
untouched, and a machine that returns to that customer gets its cover back by
itself, which a rule that deleted could never do.

**Two halves, kept apart deliberately:**

- **The party is STORED.** It is decided by two *timestamped events* — the sale
  entry and the ownership transfer — so it does not decay. Nothing about it
  changes because a day passed, which is what makes storing it honest (contrast
  `item_status`, which compares with today and therefore cannot be stored).
- **The contract and the call are MATCHED ON READ.** They depend on the party,
  and a stored attachment would disagree with it until something rewrote the row.
  It also keeps every trigger off `installation_calls` and `contract_items`,
  where a per-row rule would make a 12,000-row import pay for this 12,000 times.

**Same day, the transfer wins.** `transfer_date` is a DATE and a sale entry is a
TIMESTAMP, so a transfer recorded on the day of a sale would otherwise lose to it
at midnight — and a machine cannot be transferred before it is sold.

**A machine with neither a sale nor a transfer is left entirely alone.** Twenty
thousand came from the AppSheet import; deriving their party from registers that
do not mention them would blank the only record of who owns them.

Proved end to end on one machine: sold to OLD OWNER (CMC, MC5000, call attached)
→ re-sold to NEW OWNER (**contract and call gone from the view, both still on
record as `*_keyed`**) → transferred to THIRD HOSPITAL the same day (transfer
wins) → transferred back to OLD OWNER (**MC5000 and the call returned, nothing
re-entered**). Row 183 mutation-proved by dropping the party from the join key —
the machine immediately showed the previous owner's contract.

**Measured before shipping, which is the lesson from yesterday.** 20,012
machines, 20,001 contract lines, 9,001 installation calls, under RLS: one page
**6.6 ms**, a filtered search **72.5 ms**, the whole register with every computed
column **116.6 ms**. `DISTINCT ON` over each register once, joined — not a
correlated subquery per machine.

**It reverses yesterday's rule** that a sale never cleared `inst_call`, at the
user's instruction. That rule was right when the sale owned the field; it is
wrong now that the call belongs to the machine only while it names the owner.

---

## 2026-09-24 — A Warranty Sale puts its machines into the Product Database

> *"Every time I add a Warranty Sale entry, all the products should get added to
> the product database ... same product is sold again to a different customer,
> in that case the old data should be over written."*

Shipped in v0.9.360. **⚠ RUN `sales_contracts.sql`** — `_status.sql` row 182.

**What was there, and why it was not enough.** `sale_items` has fired
`sync_product_cover()` since 0036, and that function does an **UPDATE**: it
refreshes the cover of a machine already on the register and does nothing at all
for one that is not. So the register of what EXISTS was being kept by an import
rather than by the act of selling.

**And it keys on the serial alone**, which contradicts the rule written in
`src/lib/machine.ts`: a machine is its MODEL and its SERIAL, and the install base
holds eleven numbered 219. 0237 keys on `machine_key`, the same key
`products_machine_key_uniq` already enforces — so **re-sold to a different
customer falls out of the key** rather than needing a rule of its own.

**It writes what the sale knows and only that.** The contract columns, `extra`
and `item_status` are left alone: the sale knows nothing about a contract and a
blank would erase real cover, and `item_status` has been worked out on read since
0235. **`inst_call` is never taken backwards** — 0234's rule, since a sale
re-saved with a blank would orphan a call that exists.

**Both triggers, because inheritance is real**: the party, the address and the
warranty dates live on the HEADER. With only the item trigger, correcting the
customer on the entry would reach none of its machines.

Proved on a database built from every migration: a machine re-sold to a new
customer took the new party, city, SA number and warranty dates while **keeping
its contract, its installation call and its imported `PO No.`**; a brand-new
machine was inserted; a **VEGA sharing serial RS-1 with an ORION-G was left
untouched**; a half-typed line with no serial was skipped; and editing the entry
reached both its machines and nothing else. Row 182 mutation-proved twice — keyed
on the serial alone, and overwriting the contract.

**One consequence nobody asked for, stated rather than buried:** an ownership
transfer also writes `products.party_name`, so a later edit to the sale will now
overwrite it with the sale's party. The transfer row and the machine's history
are untouched, but the Product Database would show the original buyer again. If
that is wrong for this business the rule to add is "do not overwrite the party
where a transfer is dated after the sale", and it is one clause.

---

## 2026-09-23 — ⚠ The Product Database timed out, and the cause was not the new view

> *"Search failed: canceling statement due to statement timeout"* — reported
> within minutes of v0.9.358, with an empty register behind it.

Shipped in v0.9.359. **⚠ RUN `sales_contracts.sql`, then `product_database_2.sql`.**
`_status.sql` rows 180 and 181.

**My regression.** 0235's first version asked the contract question as three
correlated subqueries and the engineer as a per-row function call. One page
measured 6 ms here — because `LIMIT` stops after a hundred rows — and **over
120 seconds** the moment anything makes Postgres produce the columns for every
row, which any filter on the register does. Correctness was proved on five
fixture rows; the SPEED was never measured at the register's real size. **A view
over a 20,000-row register is measured at that size or it is not measured.**

Rewriting the subqueries as LEFT JOINs took it to 16 s — still hopeless — and
`EXPLAIN` then named the real cause, which was never the new view:

```
Seq Scan on contract_items ci  (actual time=16209.182..16209.182 rows=0)
  Filter: (has_perm('cover.edit') OR has_perm('masters.view') OR ... )
  Rows Removed by Filter: 20001
```

**Sixteen seconds to return nothing.** The predicate says nothing about the row
— it is the same answer for every row — but written bare it is a per-row
expression, so `has_perm()` ran four times for each of 20,001 rows, each call
reading `app_roles`. 0036 has written all four cover policies that way since the
day it was created. It never hurt because the cover registers always read with a
filter, so the scan was small. **A policy that is fine until somebody writes a
bigger query is not fine; it is waiting.**

0236 wraps them as InitPlans. Identical semantics, identical audience — the
third time this project has made this fix (0095 on hand stock, 0164 on `cr_read`
at 1,840 ms → 7.4 ms).

| measured on 20,000 machines | before | after |
|---|---|---|
| one page | 15,813 ms | **18.8 ms** |
| a filtered search | 5,518 ms | **26.3 ms** |
| whole register, every computed column | > 120,000 ms | **37.2 ms** |

**The warranty and contract registers get it too**, since they read the same
four tables.

**Two `_status.sql` clauses were written badly and one of them passed a broken
database.** The engineer test looked for `p.service_engineer AS service_engineer`
— but Postgres drops a redundant alias and renders it `p.service_engineer,`, so
the pattern could never match the mutation it was aimed at. It asks the ROWS now:
every row must agree with `party_service_engineer()`, which is the rule itself
and also catches a join written on the wrong key. Both rows mutation-proved
after that, and both mutations verified as having landed first — two earlier
attempts silently had not.

---

## 2026-09-23 — Product Database: two columns stop being stored

> *"Item Status should be a calculated value ... Service Engineer name should be
> a calculated value. It should always come from Party Master"*

Shipped in v0.9.358. **⚠ RUN `product_database_2.sql`** — `_status.sql` row 180.

**The comparison was read as `>= today`, not `<=`.** Taken literally, an expired
warranty would read WGP and a machine covered by both would read OGP — all three
inverted, and OGP is plainly the fallback for a machine covered by nothing.
0036's `sync_product_cover` already compared with `>= current_date`.

**A VIEW, not a column.** Item Status compares two dates with TODAY, so a stored
answer is right the day it is written and wrong afterwards — the fault 0222 had
to correct on Product Database 2.0, where a frozen cover status left 209 machines
of 10,000 wrong after thirty days, silently. The engineer is the same argument
one step along: the Party Master is the master, so a copy on the machine is a
second answer that goes stale the moment the customer's engineer changes.

`public.product_database` computes both. **The table is untouched** — every
importer still writes `products` — and the stored values are kept beside the
computed ones as `item_status_keyed` / `service_engineer_keyed`, so the migrated
system's answer can be compared rather than quietly replaced.

Three reads moved to it: the register, the "everything this customer has" list,
and **the call form's cover prefill** — so a call raised today gets today's
cover rather than a stored one.

**`check:replay` caught the filing, twice over.** Put beside the cover registers,
`sales_contracts.sql` died on `contract_cover_code()` — a view resolves its body
AT CREATION — and `all.sql` died too, because `cover` runs before
`product_database_2` in `ALL_ORDER`. It lives in `product_database_2` now, which
is last for exactly this reason, and declares `partyServiceEngineer` in `needs`
so the preflight says *"Apply these first"* instead of a Postgres error naming a
function. Proved by dropping `party_service_engineer()` and running the bundle.

101/101 suites, 22/22 checks. The `_status.sql` row asserts the rule on the view's
DEFINITION — this report cannot insert a machine to ask about, and a register
holding no expiring cover agrees either way — mutation-proved both ways.

---

## 2026-09-23 — ⚠ Roles & Permissions was overwriting every role on every save

> *"Role & Permission are not working"*

Shipped in v0.9.354. **Client only — no SQL.** But the DAMAGE is in the data: if
anybody saved the matrix while it was showing defaults, every role's tuned row
was replaced. `_what_can_this_role_do.sql` (new, read-only) says what each role
actually holds now.

**Two faults, and the second destroys work.**

1. `rolePerms` starts life as `DEFAULT_PERMS` (auth.tsx) and is replaced when
   `app_roles` arrives. The matrix was built in a **`useState` initialiser**,
   which runs once at mount — so a screen opened before the roles had loaded
   drew the **code defaults**, and nothing corrected it. An administrator was
   reading the code's idea of each role and believing it was the project's.
2. `save()` looped `for (const r of roles)` and wrote **every role**. So one tick
   on a matrix drawn from defaults overwrote all twelve tuned rows with those
   defaults — and reported *"Permissions saved"*.

**The fix is both halves, and the second is what makes the first survivable:**
the matrix re-seeds from `rolePerms` whenever it changes *while nothing is being
edited* (re-seeding over a half-made edit is the other way to lose work here),
and the save writes **only the roles somebody touched**. An untouched role's row
is never rewritten — the same MERGE-never-overwrite rule the migrations follow.

Three more things it now gets right:

- It **names the roles it wrote**, and says "nothing was changed" rather than
  writing when nothing was.
- **Unticking every action on a role is refused.** An empty array means "not
  configured" and `permsForRole` turns the *engineer* fallback back on — so
  saving one GRANTS permissions, which is the opposite of what unticking
  everything looks like it does.
- **Admin is still re-asserted**, but only when its computed list has fallen
  behind. It is computed and never editable here, so overwriting it is correct
  by construction — dropping it with the every-role loop would have been a quiet
  regression the day somebody added an action.

**`check:ui` caught its own stale assertion.** *"and saving walks the same list"*
matched `for (const r of roles)` literally and broke the moment the save stopped
writing every role. The property it was always about — derived from the STORED
roles, never the coded `ROLES` — is what it tests now. Two new assertions
mutation-proved (writing every role again; re-seeding over an edit in progress).

---

## 2026-09-23 — INST Call holds a call number or nothing

> *"Yes clear the placeholder and map the UCN there"*

Shipped in v0.9.353. **⚠ RUN `sales_contracts.sql`** — the same bundle as 0233,
so one run covers both. `_status.sql` row 179.

Three things, and the third is why this is a migration rather than a one-off
script:

1. **MAP** the UCN where an installation call for that machine already exists —
   on MODEL + SERIAL, never the serial alone. **Exactly one, or nothing**: where
   two installation calls name the same machine there is no way to say which the
   field means, and writing either would be a guess recorded as a fact.
2. **CLEAR** everything left that is not a call number — not only the words
   "To Check". The field's meaning is now "the call for this machine, or
   nothing", and a note left in it reads as a call number to anything that looks.
3. **A TRIGGER.** `coverImport` upserts on `uid`, so re-importing the AppSheet
   file overwrites `inst_call` with whatever the cell says — undoing the repair
   and, worse, replacing the UCN of any call raised in the app since that file
   was exported, leaving the call orphaned with nothing recording the loss.
   The guard **discards** a non-call value (the 0113/0114 rule) and **never**
   lets a real UCN be replaced by a blank. One UCN can still replace another.

**Nothing was thrown away.** `inst_call_repair_log` keeps every old value beside
the new one with the reason — the placeholder is being destroyed on 1,500+
machines and "we replaced it with nothing" is not an answer anybody can check.
The ambiguous machines are named there **with both UCNs**: they are cleared like
any other, since "To Check" is not a call number whatever else is true, but they
are the ones that would otherwise be offered a button raising a THIRD call.

`is_call_number()` in SQL and `isCallNumber()` in `coverspec.ts` are the same
rule in two languages; `check:ui` holds them together, as it does
`cover_code`/`coverCode`.

Proved on a Postgres built from every migration: one machine mapped, one cleared
with no call, one cleared and named with its two calls, a real UCN untouched,
the trigger discarding on both INSERT and UPDATE, a UCN surviving both
"To Check" and a blank, a new UCN still replacing an old one, and a second run a
no-op. `_status.sql` row 179 discriminates both ways. **101/101 suites and
22/22 checks** — the new trigger broke no fixture.

---

## 2026-09-23 — What a warranty-raised installation call carries

> *"complaint date and breakdown date has to be warranty start date. STANDARD
> COMPLAINT= INSTALLATION CALL , Reported Complaint= INSTALLATION CALL. Call
> Number - if Generated from warranty page then "WI-"PRODUCT-SLNO. ALLOTED TO
> the engineer as per party master."*

Shipped in v0.9.352. **⚠ RUN `sales_contracts.sql`** — `_status.sql` row 178.

Four changes to `installCallFromSale`, and one thing that was already true:

- **Complaint Date and Breakdown Date are the warranty start**, not gated on
  cover: a sale recording a start but no period still knows when it started. No
  start date at all leaves both EMPTY — today's date would be a date nobody
  chose, written into a quality record.
- **`INSTALL_COMPLAINT` is now `INSTALLATION CALL`**, was `Installation Calls`.
- **Call Number `WI-<product>-<serial>`**, the product unsquashed because the
  number is matched by eye against the machine row.
- **Allotted To = the effective engineer**, header's unless the machine pinned
  one. It reaches the sale from the Party Master's `service_engineer` through
  `partyFillForSale`, which is what makes "as per party master" true.
- The **Service Engineer was already on the Sale Entry and already inherited**
  by its machines. `check:ui` holds both now, since Allotted To reads it.

**0233 is a migration and not just a constant, for one reason.** Standard
Complaint is the dimension every count groups by, so a second spelling does not
read as a typo — it splits the total and the reader believes both halves.
The migration does two things, and the first is the one that is easy to forget:

1. **The master.** That picker takes no free text, so a value `masters` has not
   got is one nobody can choose and one a call opened in the form cannot show.
   Seeded under whichever name the project uses (`complaint` or
   `standardComplaint` — `listMaster` reads both). The OLD value is left on the
   master: removing it would stop the picker offering a value historical calls
   still carry.
2. **The calls already raised** — INSTALLATION calls only, matched
   case-insensitively and space-squashed. A FIELD call saying "Installation
   Calls" is somebody's own words and is not touched.

`complaint_date`, `breakdown_date` and `call_number` are NOT back-filled on old
calls: inventing a `WI-` number for a call raised before the rule existed would
be writing a fact that was never true.

**`check:ui` caught the Restore clause naming `cover.sql`, which does not
exist** — the module is `cover` and its bundle is `sales_contracts.sql`. Exactly
the fault that check was written for, on its author.

---

## 2026-09-23 — The probe cut its example exactly where the answer was

The 2026-09-22 run of `_where_are_my_service_reports.sql` came back with the
AppSheet URL shown as

    https://www.appsheet.com/image/getimageurl?appName=Reportsv2-RITHI-391

which reads as a complete URL carrying no `fileName` — so all 2,042 of them
would be unresolvable. **It is exactly 70 characters, and the file printed
`left(min(link), 70)` with no ellipsis.** The cut had landed in front of the
answer, and nothing in the output said a cut had happened.

**A URL's distinguishing part is at the END.** A head-only excerpt of one is not
a shortened answer, it is a different one — the same class as a `_status.sql`
row that answers NO for nothing, or a probe defaulting to a live address. Three
corrections, all in that file:

1. The example prints the head **and the tail** and says how many characters it
   removed.
2. **Row 5 counts what actually decides those 2,042**: how many carry a
   `fileName` to look up. Nothing counted it, and it is the only number that
   says whether the AppSheet URLs are a job or a dead end.
3. **"When visits were last entered" was not in date order.** It sorted the
   formatted `DD-Mon-YYYY` string descending as text, so 31-Oct-2023 came first
   and 31-May-2026 second — a list that reads as chronological and is
   alphabetical. And it ran to one row per day (700+ on this project), burying
   every other row. It is the twenty busiest days now, ordered by count then
   date with both keys packed into a numeric column, with the distinct-day total
   stated so nobody reads the twenty as all of them.

Proved against a Postgres built from every migration, with fixture rows in each
shape — including the exact 70-character URL and a full one carrying a
`fileName`. The two faults `parseRef` does NOT have were confirmed at the same
time: it matches AppSheet on the HOST, so `/image/getimageurl` resolves as well
as `/template/gettablefileurl`, and a URL whose `fileName` is a full path
reduces to the same base name as the bare-path rows, so one Drive lookup serves
both.

Client only — no SQL to apply, the file is a read-only diagnostic.

---

## 2026-09-22 — The 7,538 references already in the register become links

> *"uploaded links are also not getting converted into Drive links"*

**Shipped in v0.9.348. CLIENT ONLY — no SQL, no migration.** `source_ref` and
`mapped_at` have been on `reports` since 0071 and `reports_write` is `for all`,
so nothing new is needed on the database.

**What was measured, not assumed** (`_where_are_my_service_reports.sql`,
2026-09-22): 12,254 visits, of which **5,496** hold a bare AppSheet file path,
**2,042** an AppSheet URL, **493** a real Drive link and **4,223** nothing at
all. So 7,538 visits have a report that cannot be opened — the cell is a string.

**Why re-importing the sheet is not the remedy**, and why this is a second tool
rather than a fix to the first: those rows carry the engineer's own columns now.
An upsert would write the recovery file over them, which is the very thing
NAR-003.7 exists to forbid one screen down.

Bulk Report Mapping gained a card above its three numbered steps — survey,
resolve, convert, in passes of 500. Three rules, each a refusal:

- **A file Drive cannot find, or finds twice, keeps its reference.** An
  unresolved reference can still be settled by hand; a blanked one has lost the
  only thing that says which document it was.
- **The original goes into `source_ref`**, and an existing `source_ref` is never
  overwritten — that row's provenance was recorded by whatever put it there.
- **Two columns and a stamp, not a row.** Deliberately one column fewer than
  `attachReportsToVisits`, which also writes `call_status` because it is
  asserting that a report is now complete. Changing the FORM of a reference
  asserts nothing, and a status written on this path would move which visit
  decides its call's status (0032) on up to 7,538 calls in one pass.

**It also answers the open question rather than asking it.** Whether those 2,042
AppSheet URLs carry a `fileName` to look up could not be settled by reading the
code — an AppSheet link without one parses as `unknown`, is not offered for
conversion, and is now COUNTED as its own shape on the screen. The survey
reports the number.

**Two checks found gaps while being written**, both of the kind this file keeps
recording. `check:ui`'s `seesEveryRecord` rule read `src/modules` alone, so the
first call site written outside it was simply not covered — the check passed
while its rule had a hole the width of a directory. And the new `user.role`
assertion first matched the *comment warning about* `user.role`, which is the
GST check matching "18%" in its own comment; it is asked of `code()` now, and
matches `user?.role` as well, which is the form that actually gets written.

NAR-003.12 … NAR-003.19 and OQ-69 added to the validation package.

---

## 2026-09-22 — Fixing a call's cover: against the DATE, never against today

> *"i want to fix existing calls as well"*

**The obvious repair is wrong and the numbers said so.** Comparing a call's
`item_status` with its machine's cover TODAY produced 2,532 disagreements —
and the association test showed them to be cover changing over time:
disagreement was **19%** on ambiguous serials against **26%** where only one
machine wears the serial. Lower, not higher. Writing today's value onto those
calls would destroy correct history to chase a fault that measured as absent.

**The dated comparison is defensible.** `sale_items` carries
warranty_start/end and `contract_items` contract_start/end, so the registers
can say what was in force ON THE CALL'S OWN COMPLAINT DATE. A call that
contradicts that is wrong on its own terms, whenever it was raised.

`_cover_as_at_the_complaint_date.sql` reports it; `_fix_cover_as_at_the_complaint_date.sql`
corrects exactly that set. **Four refusals, each where being wrong is worse:**

- a machine with **no dated** warranty or contract record gets no opinion —
  unknown is not out of cover;
- a contract whose **type was never recorded** is not guessed into CMC;
- a call missing a date, a serial or a model is not judged;
- the match is **MODEL + SERIAL**, so a shared serial cannot lend its cover.

**Warranty decides before contract**, as `product_database_v2` has it.

Proved on five seeded cases covering every branch — warranty covering, contract
covering, both (warranty wins), dated-but-not-covering, and no dated record at
all. The last is the one that must be LEFT ALONE, and it was. Second run
corrects 0; the audit trail carried all three changes with before and after.

---

## 2026-09-21 — ⚠️ A cancelled call is not "Report pending" (0226)

> *"How did it become Report Pending?"* → *"Yes fix the Canceled status"*

Measured on the reporting upload: 11,957 rows, every one carrying a status,
producing **36** Report-pending calls out of 7,006 — and **19 of those 36 have
`last_status = 'Canceled'`**. `open_state`'s final `ELSE` turned every status
it did not recognise into *Report pending*.

**The client already knew.** `stateBucket()` has `/cancel/i → 'Cancelled'`
with its own slate chip. Five screens read `open_state` straight from the
database, so those disagreed with the register's own colour code.

**NO RE-UPLOAD.** `open_state` is derived from `last_status`; the statuses on
the rows were always right. The migration recomputes every existing call.

### A trigger, not a new generated expression — and the reason is measured

PostgreSQL before 17 cannot change a generation expression: drop and re-add,
and dropping the column takes every view reading it. Counted on a built
database: `calls`, `field_call_review`, `field_call_review_summary`, and
through `calls` another eight — **eleven views**, each needing
`security_invoker` re-asserted, which is the rebuild this project has got wrong
three times. `ALTER COLUMN ... DROP EXPRESSION` (PG13+) converts in place:
proved inside a transaction, all views and both indexes still there afterwards.
The value is then STAMPED, so a caller-supplied one is discarded (0113/0114).

### check:replay caught a second-order fault, and it was real

Five migrations build `calls_view_insert`/`calls_view_update` from the LIVE
column list, filtered on `is_generated = 'NEVER'`. The moment `open_state`
stops being generated, all five would silently start writing a DERIVED value
through the view. They exclude it BY NAME now — a no-op before 0226, the thing
that holds after. **Proved it was mine** by stashing the change: without it the
bundle replays clean.

**97/97 suites, 17/17 checks.**

---

## 2026-09-21 — The 144 recovered visits: Solved, no repair needed

> *"All these calls should be marked as Solved."*

**Solved (144).** `_why_are_the_144_not_solved.sql`, keyed on the file's own
UCNs and row ids: 144 of 144 found their call, 144 rows written, 144 carrying
their status.

**`_solve_the_144.sql` was NOT needed and must not be run.** 40 of the calls
are decided by a visit that is not from this file — and **0 of those are
blank**. They are genuine `WEB-` visits an engineer entered later, saying
*Solved - Report Completed* too. There is nothing for the repair to beat.

That file is now narrowed further: it no longer bumps a row that ALREADY wins.
The earlier version did, for idempotency, and that was backwards — once a row
has won, bumping it again writes to a quality record and changes nothing, which
with 0225 armed is 104 audited amendments to show for nothing. Beating a blank
is the only reason to write, and after one run there is no blank left, which is
idempotency by construction. Proved: run 1 bumps 1, run 2 bumps 0, and the
genuine `WEB-` visit stays the deciding entry.

**Three wrong answers preceded this one, all from asserting before measuring:**
the file had gone to a call register (it had not — 0 strays); the Close-call
audit entries had expired on a 7-day retention (retention is 3650, the log is
unpurged back to 31-Aug, and it holds FOUR closes); and the bundle to run was
`record_audit.sql` (there is no such file — it is `data_integrity.sql`).

### ⚠️ OPEN, and larger than this file

**3,600 of 3,744 bulk-loaded visits carry NO call status.** A visit with no
status can only read *Report pending* — 0032's expression, where blank is not
neutral. That is the *Report pending* seen across the register, and it is a
question about what the loads carried, not about these 144.

---

## 2026-09-21 — ⚠️ The database-enforced audit trail is back on (0225)

> *"Turn on Audit. Take a back up. Then let's do all fundas."*

0112 switched `record_audit` off on 2026-09-05, on the reasoning that it
existed for 21 CFR Part 11 and `audit_log` was trail enough. It named the cost
in its own header, and that is what 2026-09-20 collected:

> `audit_log` is written by the CLIENT: it can be bypassed by a direct API call
> and it is purged on the retention window. `record_audit` could not be
> bypassed and was not purged.

A re-applied bundle set 4,222 calls back to Unattended and **nothing in the
system could say what they had been** — the write did not come through the
client, so the client's trail never saw it. **0225 re-arms it.**

- **0103's shape, verbatim** — three STATEMENT-level triggers per table, so a
  bulk load stays ONE attributable event rather than ten thousand rows.
- `record_audit_fn()` was never removed; 0112 left it unattached on purpose and
  said re-attaching would be one `create trigger`. It was.
- **`_status.sql` row 60 moved with it** and now COUNTS all thirty triggers
  rather than testing that any exist — a partly-armed table audits some writes
  and not others, which reads as covered. Mutation-tested: dropping one of the
  thirty makes it read NO.
- **The validation package records the restoration** the way 0112 recorded the
  reduction — FRS-021, the ISO control statement, the controls table, and R-14
  back to Low residual. **The 05-Sep to 21-Sep gap is real and is stated**; it
  is not recoverable.

**Proved end to end**: armed, ran the 144-call repair, and the trail carried
the visit's before/after image and the status sync it caused. **96/96 suites
and 16/16 checks** on a database built from every migration.

### Two files to run BEFORE any repair

- **`_backup_before_repair.sql`** — copies the eight tables a repair can touch
  into a `backup_before_repair` schema, and REFUSES to overwrite an existing
  snapshot. It is not a backup of the project; Supabase's own is, and its
  point-in-time window EXPIRES, which is how the 4,222 became unrecoverable.
- **`_audit_status.sql`** — what each trail holds and how far back.
  **It also corrects something I said**: I told the user the Close-call entries
  had expired on a 7-day retention. That is 0033's figure; 0047 replaced it
  with `audit_retention_days`, defaulted to 3650. Row 5 says which is in force
  on the live project, because only the project knows.

---

## 2026-09-21 — ⚠️ Drive storage re-routed — NEEDS A CallReg REDEPLOY

> *"RE-route the File Storage to …/folders/0AEcWDaijkhs_Uk9PVA — Map it to the
> appropriate folders. Field to Field, Installation to Installation, PM to PM --
> KYC to Call Request [Installation KYC], Additional Reports to Call Request
> [Report - Installation]"*

Everything the app uploaded landed in ONE flat folder, so a Field report, an
Installation KYC and a PM report were indistinguishable the moment they were
stored. Storage is now the **"Reports" shared drive** (`0AEcWDaijkhs_Uk9PVA`),
with five folders:

| what | folder |
|---|---|
| Field call → service report | `Field Reports` |
| Installation call → report | `Installation Reports` |
| PM call → report | `PM Reports` |
| Call Request → KYC | `KYC` |
| Call Request → Installation Report | `Additional Reports` |

**✅ REDEPLOYED 21-Sep-2026.** The new `/exec` is baked into
`DEFAULT_SHEETS_URL` and `DEFAULT_URL_VERSION` is **11**, so every device's
stored URL is superseded on next load. That bump is not bookkeeping: the OLD
deployment still answers, so a phone holding the old address would go on
writing into the old flat folder silently. **No SQL.**

**Not verified from here, and cannot be**: `script.google.com` is blocked from
the sandbox's outbound proxy, so the new endpoint was not probed. First upload
after the deploy is the check.

### Three decisions worth keeping

- **Folders are resolved BY NAME, not by a pasted id.** A shared drive's
  subfolder ids cannot be read from outside the drive — they could not be read
  from here either, which is the point: an id copied off a screenshot is a guess,
  and a wrong one does not fail, it files the document somewhere nobody looks.
  Each id is resolved once and remembered in a script property, and a remembered
  id that stops resolving is dropped rather than trusted.
- **Nothing can be refused.** A folder that will not resolve falls back to the
  drive root, then to the old flat folder. Losing an engineer's signed report is
  worse than filing it one level up.
- **The old flat folder is still READ and no longer written.** Every report
  uploaded before today lives in it and stays in `_isAppDocument()`'s list —
  drop it and all of them stop opening in the app with no error to explain why.

### The rule lives where it can be tested

`driveFolderForCall()` is in **`src/lib/drivefolders.ts`**, a module that
imports nothing — the `paging.ts` reason in a second place: `sheets.ts` reaches
`supabase.ts` and its `import.meta.env`, so nothing defined there can be
imported by a node script. It is `call_table_for()` (0040) word for word —
`INSTALL%` as written, then `PM%` with the spaces removed — **proved against
Postgres** over 14 call types, with the mutation (equality instead of prefix)
disagreeing on 5 of them, so the comparison is not vacuous.

`check:ui` holds both copies of the folder list word for word, that the legacy
folder is still in the serve guard, and that every document field on the request
form names a folder. All five mutations tried were caught.

---

## 2026-09-21 — RCA: 4,222 calls Solved with no visit, and a proper export

> *"Provision to Export"* · *"How come there are 4222 Calls without report? Can
> you deep dive and come up with RCA"*

### The RCA is in the code, and it is the "Close call" button

`close_call()` (0109, 2026-09-05) sets `last_status = 'Solved'` and
**deliberately writes no visit row**. Its own header says so: *"What it does NOT
do is invent a visit: `last_visit_at` is left alone, so the visit history stays
empty and honest."* The user removed the button on 2026-09-15 — *"Remove the
Close call option doesn't make sense"* — and the note left behind in
`FieldCalls.tsx` describes precisely what this report now surfaces: *"a call
whose own history says nobody ever went, indistinguishable afterwards from one
that was actually attended."* Nothing in the application calls it today.

### Three other explanations ruled out from the code, not guessed at

| candidate | why not |
|---|---|
| A bulk call upload set them Solved | The Field / Installation / PM call uploads carry **no call-status column at all** — the "Item Status" they do carry is the COVER (WGP/AMC/CMC/OGP). An imported call arrives with `last_status = ''` and reads Unattended. |
| The visits were deleted | `sync_call_last_visit` (0032) resets `last_status` to `''` and `last_visit_at` to null when the last report for a UCN goes. A call whose visits were deleted reads **Unattended**, not Solved. |
| A visit will not take over later | It does — the same trigger recomputes from the newest report, including back to Unsolved. |

### What the data still has to settle

The user's own decision of 2026-09-05 is why this cannot be answered by a flag:
*"IT IS NOT RECORDED DIFFERENTLY. A call closed this way is Solved, like any
other closed call."* So `supabase/apply/_why_no_visit.sql` dates and groups them
instead: how many fall inside the ten days the button existed, what is outside
it, the shape by month and by row-creation day (a button pressed by hand
spreads; a bulk operation spikes), the split by register, whether any carry a
DCCR review — and **orphan visits**, the one candidate the code cannot rule out:
a visit loaded under a UCN that differs by case or spacing exists and is
invisible to its call, which looks identical to no visit at all. Proved against
fixtures reproducing both patterns.

### The export was worse than no export

It wrote the database's own column names as headings (`open_state`,
`visits_sharing_entry_stamp`) and raw ISO timestamps into the CSV — **the exact
fault recorded in CLAUDE.md for the Consumption Report**, shipped again a day
later. Now Excel and CSV, readable headings, real Excel dates (number + format,
so they sort and filter by month), numbers still numbers, and an About sheet
carrying the scope — a report whose filter is not written down is one somebody
later mistakes for the whole register.

**AND THE SHAPING IS SHARED NOW.** `asCell`/`asText` lived inside
`ReportBuilder`; this screen grew its own and got it wrong. One screen, one bug,
twice — which is the definition of a thing that belongs in one place. Extracted
to `xlsxCell()` / `xlsxText()` in `xlsx.ts`, with the reasoning, and
`ReportBuilder` now calls them.

Client only apart from the probe; **no migration**. v0.9.320.

## QUEUED — Product Database 2.0 becomes the PRIMARY product list

> *"Once it is Streamlined, i want to move this as the Primary Source for
> Product List -- Which will be used everywhere -- Calls, Age of the Machine --
> ideally everywhere."* (the user, 2026-09-20)

**Not started. This is the record of what it involves, so it can be decided
rather than discovered halfway through.**

### Why it is not a find-and-replace

`public.products` is a TABLE of ~19,229 machines, keyed on
`serial_key` — **the serial ALONE**. `product_database_v2` is DERIVED from five
registers and keyed on **product + serial**. That difference is the whole point
of 2.0 and it is also the whole difficulty: the eleven machines numbered 219 are
ONE row in `products` and ELEVEN in 2.0. Any screen switched over will start
returning a different number of rows for the same question, and for the right
reason.

### What reads the install base today

Eight call sites in `src/lib/supabase.ts`, and they do four different jobs:

| Reader | Used by | What it wants |
|---|---|---|
| `sbListProductNames` / `sbListProductSerials` | Machine History, call forms | the PICKER: product first, then its serials |
| `sbProductBySerial` | call registration | one machine BY SERIAL ALONE — the hard case |
| `sbSearchProducts` / `sbSearchMachines` | Product & Party Search, call forms | search across party / product / serial |
| `sbSearchProductParties` | the request cascade | which customers hold a product |

`machine_cover` and `cover.ts` are a fifth path, and Age of the Machine reads
the warranty start.

### The four decisions, none of which is mine to make

1. **What happens to `products`.** The standing rule is *"Do Not disturb the
   current product Database"*. Does it stay as the sales/import record with 2.0
   layered over it, or does it eventually go? Everything else depends on this.
2. **Serial-only lookups.** Call registration knows a serial before it knows a
   model. Against 2.0 that can return more than one machine. Options: ask the
   user to pick the model; accept it only where exactly ONE machine has that
   serial and report the rest; or keep a serial-only index for this one path.
3. **A machine 2.0 does not know.** 2.0 lists a machine only where a REGISTER
   names it. A machine in `products` from a source that never reached the
   registers would vanish from the pickers. **Measure the overlap before
   anything moves** — that number decides whether this is a switch or a
   migration.
4. **Age of the Machine.** 2.0's warranty start comes from the installation
   call, falling back to the selling register. `products` has its own. Where
   they disagree, 2.0 is the better answer AND the number will change on
   screens people already read.

### The order it should go in

1. **Measure first** (a probe, not a change): how many machines are in
   `products` and not in 2.0, and the reverse; how many serials are ambiguous
   without a model. Nothing is designed until those three numbers exist.
2. Switch **one read** — the Machine History picker is the safest, it already
   asks product-then-serial, which is 2.0's own key.
3. Then Product & Party Search, which is a search rather than a decision.
4. **Call registration LAST**, because that is where a wrong machine becomes a
   wrong quality record.

### What is already in place

The blockers are gone: 2.0 is fast (3–6 ms a page), it keeps itself current
(0223), its cover status is computed live rather than frozen (0222), and every
row links through to the documents behind it. That is what *"once it is
streamlined"* was waiting on.

## 2026-09-20 — ⚠️ New report: Solved Without a Report — RUN `reports.sql`

> *"Create a Report - Call is Solved, but Report or Visit Entry is missing -
> View only for Admins and Super Admins."*

Administration → **Solved Without a Report**. The list of what to re-upload,
instead of loading every report again and hoping.

**FOUR GAPS, NOT ONE**, because each needs a different fix and a report that
lumps them together cannot be acted on: *no visit at all* · *no visit date* ·
*no service report* · *entry date is an import stamp*. Every gap on a row is
listed, not the first — being told, fixing it, and being told the next is three
round trips for one call.

**THE FOURTH GAP IS THE INTERESTING ONE, AND A TEST FOUND IT.** The first draft
looked for a null `updated_at`. `reports.updated_at` is **NOT NULL and DEFAULTS
TO `now()`** — so a file with no Visit Entry Date does not leave a blank, it
silently takes the moment of the import, and the gap **cannot be found by
looking for a null at all**. The branch would have shipped as a condition that
can never fire: a claim about the data that is simply false. So the report looks
for the signature instead — how many visits share that timestamp **to the
microsecond**. Twenty-five genuinely entered at the same instant does not
happen; a batch load does. The count is published as a column either way, so the
reader sees the evidence and not only the verdict. It matters because
`updated_at` is what decides a call's status (0032 takes the LATEST ENTRY), so a
whole batch sharing one stamp lets an arbitrary row decide every call in it.

**"Solved" includes "Solved - Report Pending" and the row says which.** They are
different findings: Report Pending is the system stating a known absence; a plain
Solved with no report is the system contradicting itself. Filtering to one would
hide half the problem, merging them silently would misrepresent it.

**THE VIEW INVENTS NO PERMISSION RULE.** It is `security_invoker`, so the
ordinary call policies decide the rows; the SCREEN is what is restricted, by
`mod:/missing-visit-reports` — `admin: true` on the module plus 0224 merging the
key into the three roles in `SEES_EVERY_MODULE` (`admin`, `technical_support`,
`zoho_migration`). That is the 0209 pattern, not a new mechanism. **Note for the
user:** this system has no separate "super admin" role — those three are what
see every module. Say the word and it narrows to `admin` alone.

**Filed in the `reports` bundle, not `daily_review`**, because a view is resolved
AT CREATION and `daily_review` runs first in `ALL_ORDER`. And
`create or replace view` could not be used: the definition inserts a column in
the middle, which fails with "cannot change name of view column".

**The requirement is DECLARED on URS-065**, whose own last clause is what the
screen is for — *"a gap that is visible as a gap"* — but whose words name no
route and say "recovered" rather than "missing". `check:ui` refused the screen
until it was tied to one, which is the mechanism working.

**TO RUN:** `_status.sql` (row **172**), then
[`supabase/apply/reports.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/reports.sql).

validate: **96/96 suites, 16/16 checks.**

## 2026-09-20 — Product Database 2.0: a drawer per machine, and the references are links

> *"On clicking it, i need the Data to Load in a Drawer and all Relevant Links
> should be Clickable -- like if it has an SA No, If i click on that - it should
> open. Same for Contract, Ownership Transfer."*

**Shipped, and the second half is the part that took the work.** The drawer is
one component; making the links LAND somewhere useful meant teaching four
registers to open already searched. Passing a number to a screen that ignores it
is not a link — the reader does the search again by hand, which is the same as
no link at all.

| clicking | opens | how |
|---|---|---|
| SA number | Warranty Register | `location.state.search` → its `q`, which drives the server read |
| Contract number | Contract Register | same component, same mechanism |
| Transfer reference | Ownership Transfer | `location.state.search` → its `search` |
| Installation call | Installation Calls | `location.state.search.ucn`, which `CallSheetModule` already read |
| Serial | Machine History | `{ product, serial }` |

**Machine History could not simply be handed both boxes.** Choosing a product
CLEARS the serial there — deliberately, it is the guard the whole screen is
arranged around (serials repeat across models; 3,794 appear more than once). So
the incoming serial is held in a ref and applied only once the serial list for
that product has arrived, **and only if that list contains it**; otherwise the
screen says so. A link must not be able to type in a serial from another model
any more than a person can.

**A number that is not there is NOT rendered as a link.** Most machines carry
some of these and none carries all of them. A dead link on a record is worse
than a blank cell, because it asserts a document exists.

**Two classes that did not exist were nearly used.** `fact-grid` and
`btn btn-link btn-sm` — this codebase has `sf-grid` (Machine History's own fact
layout) and a standalone `btn-link`. A class with no rule behind it renders as
an unstyled stack, which is the `sheet-banner-warn` fault written elsewhere in
this file; checked against the stylesheet rather than assumed.

**Noticed on the live screen and NOT a defect:** the status chips read
`All 19229 · OGP 14706 · CMC 3134 · WGP 1237 · AMC 151 · Warranty 2 years 1`.
That last one is a CONTRACT whose recorded type is literally *"Warranty 2
years"*. `contract_cover_code()` returns an unrecognised type UNCHANGED rather
than bucketing it (the 0208 rule — a guess written into a quality record is
worse than a value that reads as odd), so it is showing exactly as recorded.
It is one contract row worth correcting, and the design surfacing it is the
mechanism working.

Client only; **no SQL**. v0.9.317.

## 2026-09-20 — ⚠️ 0220 REFUSED EVERY READER. 0221 repairs it — RE-RUN `product_database_2.sql`

> *"Your role does not have permission to read this."* — as **Rithi Admin ·
> Permission · Admin**
> *"And how does a Super Admin not have access to something???"*
> *"RBAC is creaking my setup, so i am not running it."*

**They do, and it was never a permission decision.** 0220 made
`product_database_v2` a `security_invoker` view — which reads **as the caller** —
over a materialised view it had, in the same file, **revoked from
`authenticated`**. The two lines contradict each other: the caller is required
to hold a privilege that was deliberately taken away. The result is
`permission denied for materialized view product_database_v2_mv` for **every**
reader, administrators included. Reproduced on a database before writing a line
of the fix.

**Why the tests did not catch it, which matters more than the bug.** The suite
said `set local role authenticated` — and **`SET LOCAL` outside a transaction
block is a no-op**, a warning and nothing else. Every "as authenticated"
assertion therefore ran as `postgres`, a superuser, which bypasses exactly the
privilege check that was broken. It passed twice while proving nothing about
roles at all. It uses `set role` now and asserts **an administrator CAN read** —
an assertion that fails against 0220 and passes against 0221. Mutation-tested
by putting the revoke back.

**And the gate is GONE, not repaired**, at the user's direction. 0220 invented a
permission predicate for this one screen that nothing else in its family has,
and it is the thing that broke. Four of the five sources 2.0 assembles are
already readable by any signed-in user — `products` (the OLD Product Database
and its ~20,000 machines), `product_additional_entries`, `ownership_transfers`,
and `machine_cover`, which publishes the same machine and cover facts to
everybody. The screen is gated where every other screen is: `mod:/product-database-2`
(0219).

**Said plainly, because it is a real change:** the warranty and contract detail
assembled here is now readable by any signed-in user who can open the screen,
where 0220 asked for `masters.view`, `cover.edit` or admin. That brings 2.0 into
line with the Product Database beside it. Putting the gate back is one predicate
and a grant — a decision for the user, not for a migration.

**`_status.sql` row 170 now asserts the grant itself**, so a project that ran
0220 and not 0221 reads NO rather than looking complete while refusing
everybody. Mutation-tested both ways.

Speed is unaffected: 3 ms / 3.5 ms / 5.8 ms for the count and two pages on the
loaded fixture, measured after the repair.

**TO RUN:** `_status.sql` (row **170**), then re-run
[`supabase/apply/product_database_2.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/product_database_2.sql).
It is idempotent, so running it again over 0220 is the repair.

validate: **95/95 suites, 16/16 checks.**

## 2026-09-20 — ⚠️ Product Database 2.0 TIMED OUT. Now materialised — RUN `product_database_2.sql`

> *"Load failed: canceling statement due to statement timeout"*

**I had the cause wrong and said so.** The hypothesis on this page yesterday was
blank product names in the registers. It was not: the query never finished. The
screen was neither refused nor looking at empty registers.

**Measured, on a throwaway Postgres built from every migration and loaded to the
live project's order of magnitude** (12,000 warranty sale items, 5,000 contract
items, 22,000 calls, 24,000 feedback rows, 10,000 machines), as `postgres` and
again under RLS as `authenticated` with an admin profile:

| read | no RLS | under RLS |
|---|---:|---:|
| `count(*)` | 164 ms | 1,361 ms |
| one page — `select *`, `order by machine_key`, `limit 1000` | 517 ms | **2,936 ms** |

The screen PAGES the view, so all five registers were re-derived for every page:
ten pages is ~30 s, and one page already exceeds Supabase's statement timeout on
live volumes.

**Where it went.** The installation-call lookup alone, isolated and timed both
ways: **24 ms without RLS, 1,255 ms with it — fifty-two times.** `calls` is the
only source in this view whose read policy is per ROW (`can_view_all_calls() OR
mine OR my team's`, and the team branch walks `user_directory` recursively). The
other four have whole-table predicates that cost the same on one row or a
million.

**The fix is 0220 and it has two parts; the first is about correctness.**

1. **`machine_install_start()` is SECURITY DEFINER.** A machine's warranty start
   is a fact about the MACHINE, and reading it through a per-row policy made it a
   fact about the READER — two people got different warranty dates for the same
   machine, and whoever could not see the installation call silently got the
   selling register's date instead. On a quality record that is worse than the
   slowness.
2. **The view is MATERIALISED.** The definer function alone took a page to
   1,764 ms — better and still hopeless, because the cost is re-deriving 10,000
   machines out of eight tables on every page. With `product_database_v2_mv` and
   a unique index on `machine_key`: **5 ms / 3 ms / 6 ms**.

**What it costs, said plainly:** the figures are as of the last rebuild.
`refreshed_at` is a column of the view, the screen prints *"Built <time>"*, and
anyone who may edit masters or cover can press **⟳ Rebuild from the registers**.
`refresh ... concurrently`, so no reader is blocked.

**Two holes the tests found that reading the file would not have.**

- **Supabase's default privileges grant `authenticated` SELECT on new tables,
  and a MATERIALISED VIEW CANNOT CARRY RLS** — so the matview inherited that
  grant and every authenticated caller could have read it directly, round the
  gate. `revoke all ... from authenticated, anon, public` is the whole fence.
  Mutation-tested: put the grant back and the suite fails.
- **A `WHERE` clause is not bypassed by superuser.** The gate is a predicate in
  the view body (a matview has no RLS), so the **Supabase SQL editor**, running
  as `postgres` with no JWT, read ZERO ROWS and reported it as an empty grid —
  the 0170 lesson in a second place. A direct session with no
  `request.jwt.claims` is admitted; PostgREST sets that GUC on every request
  including anon, so no API caller matches it.

**The gate is otherwise unchanged and widens nobody's reach**: the same
whole-table predicate as `sale_items_read` (`masters.view` OR `cover.edit` OR
admin), the narrowest of its sources. Proved by measurement — an engineer
holding neither reads 0 rows and is refused the rebuild.

**Also:** `create or replace view` in 0218 had to become a drop-and-create,
because replaying the bundle runs 0218 then 0220 and the old definition cannot
`create or replace` over a view with an appended column. `check:replay` caught
it.

**And every fixture-based suite reading this view now has to rebuild it first** —
that is the honest price of materialising, and `product_database_v2_test.sql`
says so where it does it.

**TO RUN (the user's step):** `_status.sql` first — row **170** reads NO until
this is applied — then
[`supabase/apply/product_database_2.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/product_database_2.sql).

**Also in this change:** the Review Desk reported *"500+ of 0"* — the deep load
added earlier that day sets the rows only at the END, so the previous tab's 500
sat on screen with a stale total for the whole load. Rows are painted as each
page arrives, and an uncounted total says *"still counting"* rather than 0.

validate: **95/95 suites, 16/16 checks.**

## 2026-09-20 — Daily Complaint Review Register (R/SER/35)

> *"Rename Daily Call Review to 'Daily Complaint Review Register (R/SER/35)'."*
> *"Remove these Highlighted Tabs, In Review Desk - Load all Calls in 1 Go, Or
> at a Minimum Load Recent 1000."*

**The ROUTE is deliberately unchanged.** The module key IS the route
(`mod:/daily-review`), so renaming the path would take the screen away from
every role that holds it and need a migration to give it back. A label rename
needs none — which is why this shipped with no SQL.

**There are two screens whose names differ by one word**, and a global replace
would have hit both: `Daily Call Review` at `/daily-review` and **`Call
Review`** at `/call-review`. Every edit was made by exact, asserted-unique
string, 31 of them, and `Call Review` is untouched.

**Three places were deliberately NOT renamed.** `validation.ts` (URS-058,
FRS-069 and OQ-52) quotes the literal string `"Daily Call Review"` that used to
be written into a Field Failure Report's *Raised by* — that is a DATA VALUE and
a historical record, and OQ-52 tells a tester to search the register for it.
Renaming it would have falsified a test. The revision history and `BACKLOG.md`
are records of what happened and are left alone for the same reason.
`DATABASE_SCHEMA.md` carries the old name in one `comment on column`; correcting
it needs a migration and a bundle re-run for a comment nobody reads, so it is
left and recorded here instead.

**A requirement stopped being filed under this screen, correctly.** The grouping
in `REQUIREMENTS.md` is DERIVED from the label's distinctive words, and
`Daily Call Review` → *daily · call · review* happened to match **URS-055**,
whose own text says it is *"other than routine daily coding of the failure"* —
i.e. explicitly NOT this screen. It governs Call Review and is still filed
there. The screen keeps its section through URS-058, which DECLARES it by route.
Measured before the rename, not discovered after.

**The menu could not show the name, so the menu changed.** Measured in Chromium
at the real font and weight: the name is **269px** and `.nav-label` has about
**181px**, so `text-overflow: ellipsis` was removing the last ~14 characters —
exactly `(R/SER/35)`, the reason for the rename. A long label now WRAPS. The
first attempt at that silently did nothing: `white-space: nowrap` is INHERITED
from `.nav-item`, so `overflow-wrap: anywhere` alone left the computed style at
`nowrap` and the text just overflowed. `white-space: normal` is the fix, and the
label goes from one line to two (15px → 30px). Every other entry measures 143px
or less, so nothing else wraps.

**Two tabs off the register.** DCCR Complaint Grouping and Root Cause Key Word
are MASTERS, not review work. Both are still editable on **All Masters**, which
builds itself from `masterLists.ts` — checked before removing them, so nothing
is stranded. The now-dead `lists` state, `masterList()`, `MasterListTable` and
the `listMasterLists()` read on mount went with them.

**The Review Desk was truncating silently, which is the worse half.** It read
500 rows and `Load more` was wired to the **Review Register tab alone** — so a
worklist longer than 500 ended with no button and no sign it had ended. The desk
and its three worklists now page to exhaustion (a LOOP over `range()`, never a
bigger `limit`: PostgREST caps at 1,000 rows whatever the limit says), with a
10,000-row ceiling that restores the `+` and the button rather than pretending.
The register keeps its `Load more`, which is a choice on 4,100 rows rather than
a truncation.

**`deep` rides a REF, not a parameter.** `load()` is called from six places and
only one of them is the filter effect; as an argument it was wrong at five, so
saving a single review on the desk collapsed it back to the first 500 rows. The
file already had this exact lesson written above `countFilterRef`.

**And two generated documents were being written with npm's banner in them.**
`npm run inventory > docs/MODULE_INVENTORY.md` puts `> rithi-crm-field-service@…`
and the esbuild command line at the top of the file. The redirect now lives
inside the package.json script, as `docs:reqs` always had it.

Client only; **no SQL**. `npm run build`, seven database-free checks, and the
four generated documents re-run.

**Follow-up the same day, at the user's direction** (numbers drawn on the tab
bar): the tab order is now **Register · Desk · To be Reviewed · Review 2
Pending · Review 3 Pending · Export**, and the register tab carries the form's
full name rather than "Review Register". The screen already defaulted to
`register`, so the first tab and the default now agree — they did not before.
The menu entry keeps the full name over two lines, confirmed by the user.

## 2026-09-20 — Product Database 2.0 is empty: diagnose, do not guess

> *"Ran all sql, but still the list is empty"*

**Not guessed at.** Two things done, one certain and one to be measured.

**Certain: the view was missing its GRANT.** 28 of the 30 views these migrations
create carry `grant select ... to authenticated`; this one did not. The only
other exception is `calls`, which replaced a TABLE and inherited its privileges.
Supabase's default privileges usually cover a view created by `postgres` —
which is exactly why the omission hides — and that is not a rule to rely on for
the one object a new screen reads. Added, and `check:ui` now refuses a new view
without one (mutation-tested).

That is very unlikely to be the cause of an EMPTY list, though: a missing grant
produces a permission error, which the screen reports. It is fixed because it is
wrong, not because it explains this.

**To be measured: what the registers can actually offer.** 2.0 requires a
register row to carry a serial **and** a product name, because a machine is its
model and its serial. `machine_cover` requires only the serial — which is why it
can show rows 2.0 will not, and why the ones it shows can be two machines merged
into one. **A register carrying serials with blank product names therefore gives
an empty 2.0 and a populated `machine_cover`, and neither is broken.**

`supabase/apply/_why_is_product_database_2_empty.sql` answers it with the
project's own numbers: per register, rows with a serial, rows with a product
name, and rows with BOTH — rows 4, 8 and 11 are the answer. It also reports
whether the view exists and whether the grant is in place, so all three
candidates are separated in one grid. Proved here against fixtures that
reproduce the suspected cause.

**If rows 4/8/11 come back near zero** while row 16 (the install base) is large,
the fix is a real design question rather than a bug: fall back to the model in
`products` by serial, accepting it **only** where exactly ONE machine carries
that serial, and reporting the ambiguous ones rather than guessing. Not built,
because it must not rest on an assumption about the data.

**And the screen now asks the same question itself — no SQL to run.** The empty
banner used to read *"No machine appears in the warranty sale register, the
contract register or the additional entries yet"*, which is the STRONG claim and
the one thing an empty list cannot support: it is equally consistent with
thousands of rows carrying a serial and no model, and the two need opposite
actions. When the list comes back empty the screen now counts the three
registers — rows, rows recording no serial, rows recording no model — and prints
them.

**It may only conclude from an EQUALITY.** The counts are NULL-or-EMPTY, which
PostgREST can express and `btrim` is not, so each "missing" number is a LOWER
bound — a whitespace-only cell is blank to the view and counted as present here.
`noModel === rows` therefore still PROVES no row in that register can be listed,
while `noModel < rows` proves nothing either way and gets the numbers alone.
The bound runs the safe way and the verdict never leans on the side it can be
wrong about. A register that could not be counted is reported as uncounted,
never as zero — a zero there reads as *"this register is empty"*, which is a
claim nobody measured.

**The verdict lives in `dberror.ts`, not in the screen** — the `paging.ts`
reason: `supabase.ts` reads `import.meta.env`, so a decision left beside the
fetch cannot be tested as behaviour. `emptyRegisterVerdict()` is pure and
`check:dberror` covers every branch, including the three refusals. Mutation-
tested: dropping the uncountable guard, `every`→`some`, and removing the serial
branch are each caught.

**To run:** `product_database_2.sql` again (it now carries the grant), then
`_why_is_product_database_2_empty.sql` — or simply open the screen, which now
prints the same three numbers per register.

validate: 94/94 suites, 16/16 checks (the grant). The banner that followed is
CLIENT ONLY and changes no SQL, so it was proved by `npm run build`, the five
database-free checks and `check:dberror` — ten new assertions, three mutations
caught — rather than by a second full run.

---

## 2026-09-20 — ⚠️ performance.sql re-added a constraint 0152 deleted

> *"ERROR: 23514: check constraint `parts_category_check` of relation `parts`
> is violated by some row"*

**0148 added it; 0152 drops it four files later, deliberately** — a check on
`parts.category` aborts a bulk import part-written the day the Item Master
gains a sixth word. The `add` stayed behind, guarded by
`if not exists (... conname = 'parts_category_check')`.

**After 0152 the constraint's ABSENCE is the correct state**, so every re-run of
the bundle saw it missing and tried to put it back. On an empty database that
succeeds and 0152 removes it again — which is why `check:replay`,
`check:status` and 94 suites all passed for months. On the live project, where
a part had since been loaded with a category outside the five words, the bundle
**stopped at 0148, before reaching the file that would have dropped it**.

Reproduced here exactly: built a database from every migration, inserted a part
with `category = 'Accessory'`, ran `performance.sql`, got the user's error
verbatim. Removed the `add` from 0148, re-ran on the SAME database — clean, and
the Accessory part untouched.

**The part row is not touched, and that is deliberate.** That column is the Item
Master's own word; an unexpected one appears in Spare Insights as its own bar,
which is how somebody notices it and decides what it should be. Rewriting it
would destroy the evidence.

**The check.** `check:ui` now refuses any constraint added by one migration and
dropped by a later one — dead code that still executes on every re-apply and
cannot fail until it meets real data. It was the only instance in 219
migrations; mutation-tested by putting the `add` back.

`_status.sql` row 115 already asserted the constraint is ABSENT, and still does.

**To run:** `performance.sql` again (it goes through now), then
`product_database_2.sql`, then `rbac.sql`.

validate: 94/94 suites, 16/16 checks.

---

## 2026-09-20 — ⚠️ The Restore clauses were pointing at the wrong bundles

> *"Failed to run sql query: ERROR: 42883: function public.imported_ts(jsonb,
> unknown) does not exist"*

**Two faults, one of them a week old.**

**1. `product_database_2.sql` did not declare its dependencies.** It reads
`imported_ts()` (0215, `performance`) and `cover_code()` (0208,
`data_integrity`) and installs neither, so it died part-way through on a
function name — which says nothing about what to run. It now opens with the
`preflight()` guard: *"Apply these first, then re-run this bundle:
imported_ts() — 0215… (apply bundle: performance)"*. Proved by building a
database with 0215 deliberately left out.

**2. `_status.sql` row 167 named the wrong file, and had since 2026-09-18.** It
said `Restore: HandStock_X.sql` for **0215**, which lives in the `performance`
module and is in no other bundle. So the row read NO however many times that
file was run. Now `performance.sql`.

**3. Five more rows were wrong, and that one is mine from yesterday.** `sed -i
"s|Restore: data_integrity.sql|Restore: product_database_2.sql|"` is a GLOBAL
replace: it rewrote **all five** rows that legitimately named
`data_integrity.sql` — 132, 139, 142, 145, 160 — not the one intended. The same
mistake hit `validation.ts` two days earlier. Corrected by row.

**The durable fix.** `check:ui` now refuses a `Restore:` naming a bundle that
does not CARRY the migration; it only checked the file EXISTED, which is how all
six got past. Matched on the parenthesised convention `(0215)` against the
bundle's section header `^-- 0215_….sql`. Two traps found while writing it, each
of which would have made the check lie: a bare number in prose is not the row's
migration (row 81: *"notify_spare_dispatched carries 0064"*), and a bare
`includes` reads a bundle's own preflight comment as proof it carries what it
merely names. Mutation-tested against both faults — all six rows caught.

**To run, in this order:** `performance.sql`, then `product_database_2.sql`,
then `rbac.sql`. Nothing about the data changes.

validate: 94/94 suites, 16/16 checks.

---

## 2026-09-20 — Cover requirements, and Product Database 2.0

> *"Write requirements inline with ISO guidelines for contract, warranty,
> ownership transfer, then write test cases, then the current module and tell me
> the gaps."* … *"Do Not disturb the current product Database, create this as
> Product Database 2.0."*

**`docs/COVER_REQUIREMENTS.md`** — 20 requirements (CW-001…CW-020) across
identification, warranty, contract, ownership and the assembled record, each
mapped to the ISO 13485:2016 clause it serves with a status line. The third
hand-maintained reference after CR and SR; `requirements-doc.ts` folds it into
`REQUIREMENTS.md`. Test cases CWT-01…CWT-15 (executable) plus OQ-64…OQ-66, and
URS-068/069/070 → FRS-080/081/082 in the validation package.

**The gaps, ranked by consequence** — and quantifiable on live data with
`_product_database_2_vs_1.sql`, because this repository can rank them and cannot
count them:

1. `machine_cover` keys on the **serial alone** and merges machines that share
   one under different models.
2. An **ownership transfer changes nothing** about cover anywhere.
3. Machines recovered into **Additional Entries are invisible** to cover.
4. A machine **inside warranty reads as its contract** (contract asked first).
5. A **blank contract type becomes CMC** — a labour contract read as
   comprehensive.
6. `products.item_status` is **stored and never recomputed**.
7. The **Warranty Start Date captured at installation is never read back**.
8. **Two spellings of the machine key** — generated columns lower/trim, the
   client and 0218 squash.

1–5 and 7 are closed *for anything reading the new view*. 6 and 8 belong to the
stored table and are open.

**Product Database 2.0** — `product_database_v2` (0218), a VIEW beside
`products` and `machine_cover`, both untouched. Warranty decides before
contract; labour→AMC, comprehensive→CMC, anything else unchanged; a typeless
contract is flagged, never guessed. `cover_period_end()` reproduces
`addPeriod()`'s JavaScript month overflow — **26 of 458 start/period pairs
differ** from a plain Postgres interval, proved against the app.

Screen at `/product-database-2`, `PERM_TREE` entry, and **0219** copies the
module key onto whoever already holds the Product Database.

### Two things `check:replay` and `check:bundles` caught

- 0218 was filed with the registers it reads and **died twice** — once on
  `cover_code()` (0208, `data_integrity`), once on `imported_ts()` (0215,
  `performance`) — because a SQL function body *and* a view are resolved at
  creation. It has its own bundle, last in `ALL_ORDER`.
- ⚠️ **A module name containing a DIGIT was invisible to `check:bundles`**: its
  parser matched `[a-z_]+`, so `product_database_2`'s files fell into the
  preceding module's chunk and the mirror rule was reported against a module
  that does not own them. Widened to `[a-z0-9_]+`.

**To run:** `product_database_2.sql`, then `rbac.sql` (0219). Then
`_status.sql` row **169**.

validate: 94/94 suites, 16/16 checks.

---

## 2026-09-18 — ⚠️ The probe answered about the wrong person, and a correction

The probe was run and came back as `rajendraawasthi961@gmail.com` — **not** the
Hotline Engineer it was meant to describe. Both `_why_is_it_empty*.sql` files
shipped with a live address on the line the reader is meant to change, so an
unchanged run returns a complete, plausible, confidently wrong grid about
somebody else. Row 1 printing the matched email is the only thing that gave it
away. Default is `CHANGE-ME@example.com` now (RFC 2606 — matches nobody), and
`check:ui` refuses any other default in a hand-run probe.

**A CORRECTION TO THE ENTRY BELOW.** That entry concluded the pending queue was
"genuinely clear". **It is not: 41 pending registrations exist.** That was
asserted from the local fixture test rather than from the project, and the local
run could not have shown it. What the live run does confirm is that an ENGINEER
sees 2 of 4,400 requests and 2 of 41 pending with `can_view_all_calls() = false`
— exactly right for that role, and proof the probe works on the real project.

**STILL OPEN**: why a Hotline Engineer saw 0 of those 41. Hotline is named in
`can_view_all_calls()` and was measured seeing everything on a fixture, so the
next thing is the same probe run with HER email — the one question that
separates a filtered reader from a stale screen.

---

## 2026-09-18 — "All Data should be Visible" for the Hotline Engineer

> *"HotLine Engineer -- All Data should be Visible for this user"* — with
> Pending Registrations showing 0.

**The permissions were already right, and that was measured rather than
assumed.** On a database built from every migration, a `hotline` profile gets
`can_view_all_calls() = true` and reads all four call requests including both
pending ones raised by a different engineer. Nothing to grant.

**What was actually wrong is the CAP.** `cr_read`'s first branch is
`can_view_all_calls()`, which names hotline — so the Hotline desk's pending list
is the whole company's, not one person's, and that read was `.limit(300)` and
unpaged. `check:ui`'s `.limit(n > 1000)` rule cannot see it: 300 is *under* the
PostgREST cap, so nothing lied about truncation; the screen stopped at 300 and
called it *"300 pending call registrations"* with no `+`. Paged in full now,
with `id` as a tiebreaker after `submitted_at` — a bulk import makes ties
certain and a tie puts a row on two pages or on neither.

So the reported 0 means the queue is genuinely clear: every request registered,
mapped or cancelled.

**`_why_is_it_empty_2.sql` now prints SEEN beside EXISTS** (rows 4/5 and 6/7),
because either number alone answers nothing — "0 of 0" is an empty queue,
"0 of 40" is somebody being filtered.

⚠️ **The probe only impersonates on the REAL project.** It sets
`request.jwt.claims`, which Supabase's `auth.uid()` reads; `_stub.sql` replaces
`auth.uid()` with a stand-in reading the `harness` TABLE, so run locally it
ignores the claims, `can_view_all_calls()` returns NULL and every count reads 0.
That looks exactly like a damning finding and is an artefact — it was nearly
reported as one. Use `call public.be(...)` against the harness instead.

Client only, no SQL. validate: 93/93 suites, 16/16 checks.

---

## 2026-09-18 — Designation in the header, and that line is called Permission

> *"Display the Designation here, Add a New Place Holder for RITHI Role."*
> …then: *"Not Required. Instead of Rithi Role, Name it as Permission."*

The header chip showed only the role, unlabelled, in the place a reader looks
for a job title — so the DESIGNATION (the job somebody holds) and what the app
grants were being read as one. Both are shown now, and the second line is
labelled **Permission**, the user's own word: it says what the value DOES rather
than which system it belongs to.

My Profile carries the same pair in the same order (Designation, then
Permission), since it is the other place both appear.

**DECIDED AND CLOSED: the `ROLE` column in User Master is NOT renamed** — asked,
answered "Not Required". Do not re-propose it.

The deeper block on My Profile still says "Role in effect (rm)" and talks about
the role *as configured under Roles & Permissions*. That is deliberate: it is
that admin screen's own vocabulary, and renaming half of it would read worse
than leaving it whole.

Client only, no SQL.

---

## 2026-09-18 — The Consumption upload files the visit it needs

> *"Unable to re-upload — No visit has been filed on 26H26F0029 yet … (row ~1)
> (0 written before it stopped.)"*

0214 is right and, as an answer, was useless: it stopped the whole file while
the visit it wants was **in the file**. `Visit Date & Time` is the column this
register already maps onto `created_at`; `Visit Entry Date` lands in `data`.

`prepare: 'consumption-visits'` files the visit first, from the file's own
values — **recording** the guard's requirement rather than evading it. Both date
columns and **Visit UID** then fill themselves, which answers this morning's
"how do I fill these?" at the source.

**Nothing is invented.** No visit and no date in the file means no visit, and
those rows are held back **by name** while the rest loads — the one thing the
all-or-nothing refusal could not do.

Three rules pinned by `check:uploads`, each a silent fault if it drifts:

- **one visit per UCN**, not per line — per-row keying makes the call's status
  come from whichever row was written last
- the **first** dated row wins, so a re-run is stable
- the uid is `REPORT_COLS`' own derivation, compared **against that function**
  rather than a literal: drift does not error, it makes a second visit of one
  call on one day

The planner sits in `uploads.ts`, not `supabase.ts`, for the `paging.ts`
reason — that module reads `import.meta.env`, so nothing in it can be tested as
behaviour. Proved end to end against Postgres: the user's exact error
reproduced, then the same insert accepted with the visit filed, the report
showing both dates and the UID, and a re-file leaving one visit.

Client only, **no SQL**.

---

## 2026-09-18 — ⚠️ 0210 deleted three rules from the spare line guard

**Shipped yesterday, open for a day, repaired by `0217`.** 0210 rewrote
`spare_request_lines_guard()` from an OLD revision to add the HandStock NSM
rule. Six rules went in; three came out. It kept RM / Commercial / NSM approval
and lost:

- dispatch / DC requires `spare.dispatch` (a drop needs `spare.drop`)
- recording a REJECTION requires an approval permission
- RECEIPT: needs `spare.receive`, only by the engineer who RAISED it, and only
  AFTER the line is dispatched
- only the engineer who raised the request may change its PARTS

**Measured, not reasoned about.** On a database built from every migration, an
engineer marked a line received that had never been dispatched — `UPDATE 1`, no
refusal, stage straight to Received while its sibling still read Dispatched —
and a different engineer acknowledged somebody else's spare. The parts rule was
covered by no test at all.

**Why nothing caught it.** `check:replay` compares each bundle against
`all.sql`, and both are built from the same migrations: a function truncated in
the migration is truncated identically in both and they agree perfectly. The
suite DID fail, and `VALIDATION_RUN.md` named the **wrong two expectations** —
the harness pairs `expect ERROR` with the next error in order, so two guards
failing early shifted every later pairing. Counts right, names wrong.

`_status.sql` **row 168** counts all six rules by name now, and reads NO against
0210's shipped guard (mutation-tested). It is the 0211 lesson a second time:
**read a function out of the DATABASE before replacing it.**

## 2026-09-18 — Ten broken suites, and a check that failed on its own prose

`npm run validate` was not run after 0210 and 0214. It should have been.

- **0214** (`zz_consumption_needs_visit`) broke **nine** suites — every one that
  books a spare against a fixture call with no visit. Each now creates the visit
  first, except `consumption_report_test`'s **CR-2**, which has no visit *on
  purpose*: that one lifts the single trigger by name, because those rows are
  exactly what "predates the rule" means.
- **0210**'s NSM rule broke `stock_transfer_test`, whose fixture had an RM
  waving NSM through on a HandStock request.
- `handstock_needs_nsm_test` had an `expect ERROR` written as a **SQL comment**,
  so the harness never saw it and counted its error as unexpected.
- `check:ui` was recorded as FAILED in every run while passing everywhere else:
  the runner tested `/FAILED/` against the whole output, and one PASSING
  assertion is labelled *"a failure is dated by when it FAILED"*. Anchored now.

**Now: 93/93 suites, 16/16 checks, 165/165 expectations matched.**

---

## 2026-09-18 — The probe that needed the SQL it was asked about

> *"Failed to run the SQL — ERROR: 42883: function public.imported_ts(jsonb,
> unknown) does not exist"*

`_do_i_need_to_reupload.sql` called `public.imported_ts()`, **which 0215
creates** — and 0215 is exactly what is still waiting to be applied. The one
file whose job was to say whether anything needed running could only run after
it had been run.

Every check passed it: they all build their database from **all** the
migrations, so the gap is between this tree and the LIVE project, and nothing
here knows which migrations have actually been applied. The key match is written
out inline now (same rule, case and punctuation squashed), and it was tested on
a database built with **0214 and 0215 left out** — the live state — where the
old version reproduces the user's error exactly and the new one returns its six
rows.

Row 4 now counts the heading being PRESENT and non-empty rather than parsing it,
which is the fact that decides a re-upload, and is the half that does not need
0215.

## 2026-09-18 — "How do I fill Visit Date and Visit Entry Date?"

Neither is a column of `spare_consumption` — `consumption_report` LEFT JOINs
`public.reports` — so **re-uploading consumption cannot fill them** and there is
no field to type them into. The answer is to load the **visits**: Bulk Uploads →
Visit Reports → Field / Installation / PM Reports, one row per visit keyed by
UCN, where `Visit Date & Time` → `visit_at` (required) and `Visit Entry Date` →
`updated_at`. Every spare on that call then fills, `Visit UID` included — which
0215's fallbacks deliberately cannot supply.

Written up in `docs/HOW_TO_USE.md` with the three consequences that are easy to
walk into: a blank `Call Status` leaves the call reading *Report pending*; the
derived `uid` means a re-load updates rather than duplicates (and collapses the
several consumption rows sharing a UCN and date into the one visit they were);
and a row with no visit date is refused on purpose.

---

## 2026-09-18 — Default columns, and a column the report could not offer

> *"Add Default Columns - Line ID , Source Ref Key , Created At to the
> Consumption Report. Shall I re-upload the Import Data?"*

**Shipped, client only — v0.9.301. No SQL.** All three columns already exist on
every row; nothing needed loading.

### A third state, between mandatory and optional

`ReportSpec.defaults` — ticked to start with, and still removable. Deliberately
NOT added to `mandatory`, which is shown ticked and **disabled** because it is
the format that was handed over; a default is a starting point somebody may
change. A **Back to the default columns** button sits beside the two that were
already there.

Every default must also be in `OPTIONAL`, because the file is built from that
list and not from whatever happens to be ticked — a default outside it would be
ticked in the picker and silently missing from the workbook. `check:ui` and
`check:reports` both refuse it.

### The bug this turned up: `Visit UID` was unreachable

0215 added it to `consumption_report` yesterday, it was announced as added, and
`CONSUMPTION_OPTIONAL` was never updated — so the picker could not show it and
`exportColumns` could not emit it. **Invisible to every user for a day**, with
the column sitting in the database the whole time.

Nothing in the repository could have caught it: `tsc` sees two lists of strings,
`check:ui` does not know what a view is called, and reading the migration is the
method that missed it. **`npm run check:reports -- "<psql args>"`** asks a
database instead, for all three reports and in both directions — a view column
nobody offers, and an offered column the view does not have (which would export
an empty column under a heading that promises a value). Mutation-tested on all
three failures; it is in `validate` and in `NEEDS_DB`.

### Numbers, while the dates were in hand

`Line ID` sorted 1, 10, 100, 2 and a `SUM` over `QTY` answered 0 — both were
being written as text, which is the same fault the dates had. `asCell` now
returns a JS number untouched. The test is `typeof v === 'number'` and nothing
looser: PostgREST sends numeric columns as numbers and text columns as strings,
so a Serial No of `0012345` keeps its leading zeros instead of becoming 12345.
Proved by building a workbook and unzipping it.

### "Shall I re-upload the Import Data?"

**No, not for these three.** `_do_i_need_to_reupload.sql` answers it against the
real rows rather than in principle: Line ID and Created At are on every row;
Source Ref Key is the file's own row id and is blank on anything booked in the
app, which is correct. The only thing a re-upload can still add is
`Visit Entry Date` — and only if the file in hand carries a heading the loaded
one did not. Row 4 of that probe is the count that says which case the project
is in; row 3 says how many lines a re-upload would UPDATE rather than duplicate.

---

## 2026-09-18 — Excel-native dates, and where a visit date comes from

Three asks in a row, all on the Consumption Report.

### "not Complaint with the Long Date Format of Excel"

The formatted string was still **text** to Excel: it cannot be sorted into date
order, filtered by month, subtracted from another, or given the reader's own
format — and every one of those returns something wrong rather than refusing.

The `.xlsx` now carries real date cells: a serial number plus a `numFmt` in a
`styles.xml` the writer did not previously have at all. The CSV keeps the
readable text, which is all a CSV can carry.

**Two bugs in my own first version, both found by building a workbook and
reading the bytes** — neither would have shown up by reading the code:

- `excelSerial` used `parseAnyDate`, the lenient DISPLAY parser, and turned the
  part code `MP-010` into serial **37165**. In a spreadsheet that is not a
  wrong-looking string but a NUMBER under a date format, so the column silently
  stops being a part code.
- A date-only value went through `new Date('2026-09-18')` — UTC midnight read
  back locally — giving every date in India a **05:30** fraction.

It uses the strict ISO test now, the same one `formatDayTime` uses.

### "Map the first booked date" / "as in from the Import"

Three sources, and **the order is the rule**: the real visit, then what the file
said, then the first booking on that call. An imported date is a recorded fact
from the system the data came from; the first booking is only an approximation.

The Consumption upload already maps `Visit Date & Time` onto `created_at`, so
the first-booked fallback was surfacing that one; everything it does not map
falls into `data` keyed by the header as typed, which is where
`Visit Entry Date` lands. `imported_ts()` reads it with case and punctuation
squashed — and **returns nothing rather than raising** on a cell holding "n/a",
because a bare cast there would not spoil one cell, it would take the whole
report down.

### "Give me the UID"

`Visit UID`, appended at the end (`create or replace view` can only add columns,
and only after the existing ones). Blank where there is no visit: **a date can
be approximated, an identifier cannot.**

### Still to run on the live project

`_status.sql` first — rows **166** and **167**. Then `HandStock_X.sql`, at the
repository ROOT.

---

## 2026-09-18 — A download is not the wire, and a spare needs a visit

*"Reports - Consumption Report - Date Format - When I download, Its showing like
this - 2026-09-18T08:51:02.55+00:00 -- But i want it to be dd-mmm-yyyy
hh:mm:ss"* and *"Visit Entry Date is Empty, Visit Date & Time is Empty -- No
Consumption should be accepted without these Details."*

### The dates

`formatDayTime()` in `dates.ts` — the one formatter, beside `formatDay` —
and `ReportBuilder` applies it to every cell on the way out, so **all three
reports get it from one place** rather than the one that was reported.

**By value, not by column name.** The columns differ per report and move with
the picker, so a list of date-ish headings is a list to forget to update.

**The offset is the point, not the punctuation.** The database stores UTC, so
printing the front of that string put the wrong TIME on the row and, before
05:30 IST, the wrong DAY. A value with no offset is a wall clock and is printed
as written; a date with no time stays a date rather than gaining a midnight
nobody recorded; anything unreadable comes back exactly as it arrived — the
pattern is anchored at both ends so a remark beginning with a date survives.
Eleven assertions.

### The empty visit columns

Those two are **not stored on the consumption row**. `consumption_report` LEFT
JOINs the latest visit (`Visit Entry Date` ← `reports.updated_at`,
`Visit Date & Time` ← `reports.visit_at`), so both blank means one thing: the
call has no `reports` row and the visit was never filed.

0214 refuses an insert whose UCN has no visit.

**Establishing the ORDER was the thing to do before writing that guard at all.**
Call Reporting saves the visit FIRST and the spares second — its own comment
says *"the visit is already filed, so pressing Save Report again retries just
this"* — so the everyday path passes untouched. Had it been the other way round,
this trigger would have broken every report in the field.

**It also stops the bulk Consumption upload** for rows whose call has no visit.
Deliberate, and said out loud rather than discovered: those rows are refused
rather than landing blank. Genuinely historical consumption has its own table.

**Existing rows are not rewritten** — an insert-time rule applied backwards to a
quality record would invent a visit that did not happen, which is worse than a
blank that is true. `_consumption_without_a_visit.sql` lists them, with a
diagnosis per UCN (call missing vs visit never filed — both branches proved).

### Still to run on the live project

`_status.sql` first — row **166**. Then `HandStock_X.sql`, at the repository ROOT.

---

## 2026-09-18 — Stores Incharge and Spare Coordinator see every row

*"data.view_all --- Stores In Charge, Spare Co-ordinator should be able to view
all Rows. Fix this. I am working to Fix the Spares Module for Stores In Charge,
Spare Coordinator, Commercial."*

0213 merges `data.view_all` into **exactly those two roles**.

**Commercial is named in that message as part of the MODULE being worked on, not
as a role to grant**, so it is deliberately not included — and the suite asserts
it did not pick the permission up by association.

### What it does and does not change — worth stating before judging it by the screen

Both roles **already** pass `can_view_all_calls()`, which names them directly,
and every policy in this database consulting `data.view_all` consults that
function too — all three of them (`handstock_opening`,
`spare_consumption_history`, `spare_issue_history`). **There is no policy where
this permission is the only way in.**

So the grant is belt and braces, and worth having for that: it states the intent
on Roles & Permissions, and it keeps working for somebody given a role KEY that
is not one of the six names hard-coded in that function.

**Which means: if rows are still missing after this, the permission was not the
cause.** Both routes read `profiles.role`, so a person whose profile says
`stores` or `Stores Incharge` rather than `stores_incharge` matches neither.
`_who_can_this_person_see.sql` row 2 prints what their profile actually holds.

### The negatives are the point

The standing rule is that Regional Manager, Reporting Manager and Engineer are
as the user set them. A grant reaching a fourth role is a worse failure than one
reaching none, so the suite asserts each of those three is untouched, and
`_status.sql` row 165 checks **both halves** — the two hold it, and those three
do not. Mutation-tested each way.

Two things needed a second attempt and both are the same lesson:

- **The suite was vacuous first time.** Its fixture inserts run *after* the
  migrations, replacing the rows 0213 had already granted — so it reported
  "(none) hold it", which reads as a broken migration and was a broken test. It
  re-runs 0213 after its fixtures now (the migration is idempotent, which is
  what the live project does anyway).
- **Row 165 read NO on a correct database.** Its first version policed a
  whitelist of everyone else, and `technical_support` and `zoho_migration` hold
  `data.view_all` legitimately from 0145. It names the three protected roles
  instead — narrower, and the actual requirement.

### Still to run on the live project

`_status.sql` first — row **165**. Then `rbac.sql`.

---

## 2026-09-18 — A blank name is not a manager

*"Too many bugs. Why is a Regional Manager able to see everyone's call and every
spare request?"*

**There are only three ways anybody sees work that is not their own**, and the
first job was telling them apart rather than guessing:

1. **An office role.** hotline, nsm, commercial, spare_coordinator,
   stores_incharge, tally_coordinator — by design, written into
   `can_view_all_calls()`. A Regional Manager is **not** on that list.
2. **`data.view_all`.** One permission, and `can_view_all_calls()` is true for
   any role holding it. **No migration grants it to `rgm`**, so a Regional
   Manager holding it was ticked by hand on Roles & Permissions. That is a
   configuration answer, not a bug.
3. **The directory genuinely says they manage that many people.** A regional
   manager covers a region; a long list is not by itself wrong.

### ⚠️ And while checking (3), a real leak

`visible_engineer_names()` walks `user_directory` downwards from the caller, by
`reporting_manager` **and** `regional_manager`. The walk compared names with
**nothing excluding the empty string from either side.**

So a caller whose own directory row has a blank `name` — a partial import, a
trimmed cell, a row keyed only by email — asks for everyone whose manager is
`''`, and gets **every row with no manager recorded**.

Measured on a fixture, both ways:

```
name present : ENG ONE, ENG TWO, ENG THREE, HARSH RM       <- correct
name blank   : ENG TWO, ENG THREE, STRANGER A, STRANGER B  <- wrong BOTH ways
```

Read the second line carefully. It is not "sees everyone" — it is worse to
diagnose than that. Two strangers are pulled **in**, and one of his own team is
pushed **out**, because the root no longer matches the people who name him.
Nobody reading that list could tell it was a fault rather than a region.

**The fix is one condition and only ever narrows.** A tree node with a blank
name stops recursing, so a caller the directory cannot name sees no team at all
— the honest answer; they still see their own work through the read policies'
id and email branches. The comparison itself is left exactly as it was: adding
`btrim()` to both sides would also make `' X '` match `'X'`, which is a
**widening** and a different decision from closing a leak.

0212 sits in the `user_directory` module **after 0092**, which owned the
previous definition — same module, so no mirror is needed and a replay of that
bundle alone still ends on the newest body. `check:replay` confirms.

Suite `visible_engineers_blank_test.sql`, mutation-tested: with 0092's body
restored the blank case leaks strangers and the suite says so.

### Still to run on the live project

`_status.sql` first — row **164**. Then `user_directory.sql`.

**And check the permission first**, because it is quicker and more likely:
`supabase/apply/_who_can_this_person_see.sql` says in one grid whether this is
`data.view_all` ticked on the role (untick it on Roles & Permissions, no SQL
needed) or the directory.

---

## 2026-09-16 — Renewing a contract at the new price

*"In contract module - Renew this contract - I will need provision to revise
the price."*

Until now the renewal deliberately left every rate blank and said so, and
somebody opened each machine afterwards to type one in — twenty trips through a
form on a twenty-machine contract. The panel prices it now:

- A **New Rate** box per machine, with **what it was charged on the expiring
  contract** shown beside it as context.
- **GST and total after tax** computed as you type, through
  `itemTaxAmount`/`totalAfterTax` — the contract form's own rule, not a second
  copy — plus the contract total at the foot, so a rate with a digit too many is
  visible before it reaches an invoice.
- **Revise all ticked by _%**: fills every ticked machine from its own old rate.
  Each box stays editable. `0%` holds last year's price; a machine with **no**
  old rate is left blank rather than set to 0, because "we do not know what this
  was on" and "it was free" are different facts.

**The rule underneath did not change.** The old rate is shown BESIDE the box and
never IN it, and every box starts empty — a renewal saved with all of them blank
writes exactly what it wrote before. Nothing is carried forward silently; the
uplift only ever runs because somebody typed a percentage and pressed a button.

`check:ui`'s renewal assertion had to change with it, and the change is the
point: it used to assert that `rate:` never appears in `renewContract` at all,
which was right while the flow could not price anything and **forbids the
feature rather than the hazard**. The hazard is reading money off `it` — the
machine on the *expiring* contract. That is what it tests now, plus that tax and
total are derived rather than re-invented and that 18 appears in exactly one
place. Both mutations caught.

### ⚠️ And the renewal was doubling the contract period

Found by giving the preview a realistic fixture: a one-year contract proposed a
renewal ending **two years** out.

A contract states its length **twice** — `contract_years` is derived from
`contract_months` (months / 12), so twelve months is stored as years = 1 AND
months = 12. `proposeRenewal` read both and passed both to `addPeriod`, which
adds them: 24 months. A two-year contract renewed for four. The contract FORM
never had this, because it computes the end from months alone; only the renewal
passed both.

This is not cosmetic — it is a service contract covering twice what anybody
agreed, and `machine_cover` answers "what is this serial under today?" from
those dates.

`periodToMonths(years, months)` in `coverspec.ts` is the single reading (months
wins; years is the fallback for a row that only has that, so an old import does
not lose its period), and the panel's two period boxes now set each other
instead of both feeding the end date. Seven assertions, mutation-tested.

---

## 2026-09-16 — The Spare module schema, and the guard 0210 was leaving off

*"Build a Schema for every Table in the Spare Module - Highlight all important
Variables, Type of Field, Mandatory / Optional, What is allowed, what is not
allowed, How it flows to the Next Module, Down Stream / Up Stream links. Add
this to "Schema" under How it Functions."*

Shipped as `public/docs/spare-module-schema.html`, the **fourth** document in
`DOCS` on How RITHI Functions. Sixteen table cards across six movements, every
fact introspected from a Postgres with every migration applied — columns, types,
defaults, generated expressions, CHECKs, unique indexes, foreign keys in BOTH
directions, triggers and row-level policies — and every refusal quoted from the
message the system actually raises.

**It does not read "mandatory" off `NOT NULL`, deliberately.** That answer is
wrong in both directions in this module: most `NOT NULL` columns carry a default
and are never supplied by anybody, while four of the genuinely required fields
on a reconciliation (UCN, part, engineer, reason) are NULLABLE in the DDL and
demanded by a trigger. The badge answers the question somebody actually has —
*must I put something here?* — and the rule beside it names what enforces it.

### ⚠️ What writing it found — a hole in 0210, which had not yet been run

Documenting `spare_requests` meant asking the database which triggers it
carries. It carried four, and `spare_requests_stage_guard` was not among them.

**0210 step 2 drops three guards** so the backfill can write approval columns
nobody decided, and **restored only two**. Nothing caught it:
`npm run check:replay` compares FUNCTIONS, and the function was untouched — only
the TRIGGER was gone. The file reads as correct, and even carries a comment
about remembering to restore the *second* of the three.

Measured rather than reasoned about, on two databases built from the same
migrations with and without 0210. An engineer holding `spare.request` and
nothing else is the requester, so `sr_update` lets them write their own request.
With the guard off, **one UPDATE** set `rm_approval`, `commercial_approval`,
`nsm_approval`, `stores_status` and `received_at` — carrying their own request
past RM, Commercial, NSM and Stores to Received. The per-line RBAC in
`spare_request_lines_guard()` never ran, because no line was touched. With the
guard on, the same statement raises *"Spare approvals are recorded per spare —
update spare_request_lines, not the request."*

The irony is the sharp part: this is the migration whose whole purpose is to
**lengthen** the approval chain.

Fixed in 0210 (the trigger restored; the function deliberately NOT redefined —
0016 has the last word on it and re-stating an older body is how a wider hole
gets opened). `_status.sql` row 162 now counts **all three** triggers rather
than one, and `handstock_needs_nsm_test.sql` gained two steps: the count, and a
behavioural probe. **That probe has to OWN the request** — pointed at somebody
else's, RLS makes the UPDATE match zero rows and it passes with the guard
removed, which is exactly what its first draft did. Mutation-tested both ways.

### ⚠️ And a second thing, in the same migration's wake

`spare_dispatch_test.sql` had **not been brought forward for 0210** either. Its
fixtures approve every line as the RM and stamp `nsm_approval = 'Auto-Approved'`
in the same write — which is exactly what 0210 stopped allowing on a HandStock
request. So three of the four fixture lines sat at **NSM**, never reached
Stores, and every dispatch in the suite failed with *"Nothing to dispatch: no
spares selected"*.

**The suite still printed all twelve of its headings.** Its result tables were
empty and nothing said so. Worse, step 7's labelled `expect ERROR` — *"a stock
out goes to one engineer"* — went on erroring, for the **wrong reason**: the
queue was empty, so the call failed before it ever got as far as noticing two
engineers. An expected error that fires for the wrong reason is indistinguishable
from a passing test.

Fixed by giving the suite an NSM and having them approve the HandStock lines, as
the live system now requires. It dispatches again: stock outs created, SO and DC
numbers assigned in series, hand stock counted from them. Two `of N` assertions
were added at the fixture stage so an empty queue announces itself next time
rather than quietly passing.

### Still to run on the live project

**`Spare_1.sql` has changed — run it again even if you already ran it.** It is
idempotent, so a second run is safe, and it is the only thing that puts the
guard back. `_status.sql` first: row **162** now tests all three triggers, so it
reads NO until this is applied.

---

## 2026-09-16 — Hand Stock, and the five movements that were asked for separately

Asked for as four documents — Spare Reconciliation, Material Return, Stock
Transfer, Handstock — then: *"I think it has a flow to Handstock -- See if it
can be merged."* Then *"Add Consumption & Stock Out as well."*

**Merged, and it is the better document.** All of them are entries in ONE
ledger, and the balance formula is what makes any of them make sense:

    on hand = opening + stock out + transfers in − consumed − transfers out − returns

Five separate pages would repeat that formula five times and hide the
relationship. One document puts the balance at the centre and hangs each
movement off it — which is also the order somebody needs to read them in.

**The order is IN then OUT**, not the order they were asked for: Stock Out and
the opening balance first, because the balance has to exist before a refusal
against it means anything; then consumption (reported, reconciled, voided),
transfers, returns.

**Consumption is the control point and the document says why**: every other
movement has a document and a second party behind it, so it is the one a person
enters freely and the one the database guards with a hard refusal. Every
refusal is quoted as the system actually words it.

Shareable copy: <https://claude.ai/artifact/HWP2Hy2yEZmpJevgeffZvm>

---

## 2026-09-16 — The delivery challan named the wrong person

*"dispatched_by -- Is not actually taking the Name based on the USer. Kasturi is
Dispatching whereas it still shows Jagadesh."*

**The app was never sending a name at all.** `SpareDispatch.tsx` read
`user?.name` — and the `User` type has no `name`; it has `fullName`. It
type-checked **only** because `BaseRecord` carries an index signature
(`[key: string]: unknown`), so the expression was `undefined` at runtime every
time and fell through to the email. No error anywhere.

And `dispatched_by` came from the CALLER: `dispatch_spare_lines(..., p_actor)`
writes whatever the app sends into `spare_dispatches.dispatched_by`, and the
line rows copy it from there. So a fault in the app was a fault on a document
that **leaves the building with the company's mark on it**.

Fixed the way this project already fixes it for a call's registrant (0113/0114):
**a caller-supplied value is DISCARDED, not refused.** Refusing makes an honest
client fail; discarding makes a buggy one harmless.

### A trigger rather than a rewrite — and why that matters

The first draft of 0211 edited `dispatch_spare_lines` to resolve the name
itself. It was written against **0027's version of that function, four revisions
out of date**. The live one carries partial dispatch: per-line quantities, the
outstanding balance, the refurbished flags and the `spare_dispatch_lines` rows.
A tidied copy of the old body would have **silently deleted all of it**.

Caught by reading the function out of the database before trusting the migration
file — the same habit that this repo's own rule recommends and that I had not
applied to a function I was about to replace. 0211 touches the function not at
all: a `before insert` trigger on `spare_dispatches` overwrites the column, which
also covers any other path that inserts a dispatch.

`check:ui` now refuses `user.name` anywhere in the app, since TypeScript cannot.

### Still to run on the live project

`_status.sql` first; row **163**. Then `Spare_1.sql` (0211) — repository ROOT.
The app-side fix alone puts the right name on new stock outs; the migration is
what stops it ever being the app's to get wrong.

---

## 2026-09-16 — A HandStock request goes to NSM

*"For Handstock request - NSM has to approve the request."*

**Replenishment was leaving on one signature.** One rule decided both middle
stages — `spare_needs_review(item_status)` = AMC or OGP — and a HandStock
request has no machine, so no item status, so the rule was FALSE: the RM's
approval stamped BOTH Commercial and NSM `Auto-Approved` in the same write and
the line went straight to Stores.

The two stages stop sharing a rule, because they no longer ask the same
question. Commercial judges whether somebody is being CHARGED (AMC/OGP,
unchanged); NSM judges whether the stock is WARRANTED — and replenishment is
the case where only the second question has an answer.

### The design decision worth recording

The obvious change is a seventh argument on `spare_line_stage`. It is the wrong
one: **seven migrations call that function** (0016, 0025, 0031, 0055, 0116,
0118, 0154) and three define views whose current definitions live in the later
files. And leaving a six-argument version beside a seven-argument one is the
two-definitions trap — the short one cannot see `req_type`, so it answers the
OLD rule, correctly-looking, for anything still calling it.

So **the rule moved out of the stage and into what gets STAMPED**. The stage now
follows the recorded columns alone, which is the more honest reading anyway: a
stage should report the decisions on the record, not re-derive from the cover
whether a decision was required. Whether a stage is needed is settled once, at
RM approval.

**Which is what makes step 2 of 0210 the important part.** Under the old rule a
line could sit at Stores with BLANK middle columns — nothing was ever written,
because nothing was needed. Read by the new rule those rows say "Commercial has
not approved" and would march backwards out of Stores. So today's meaning is
pinned into the data first: every line the old rule waved through gets
`Auto-Approved` written into the columns it waved through — with **no `_by` or
`_at`**, because nobody decided them and inventing an approver on a quality
record is worse than an outcome with no name against it.

### check:replay caught a regression in my own migration

The first draft redefined `spare_requests_stage_guard()` with the old per-stage
logic. That function was **superseded by 0016**, whose body refuses any approval
written to `spare_requests` at all — *"Spare approvals are recorded per spare —
update spare_request_lines, not the request"*. Redefining it would have quietly
re-opened request-level approval writes: **a wider hole than the one this closes**.
Caught before it shipped, by the check written for exactly that.

Two more faults the suite caught in itself: an approver who is not the
engineer's manager cannot SEE the rows, so every `UPDATE` matched nothing and
read as "the guard refused it" (it refused nothing); and the request's stage is
a ROLLUP of its lines, so a fixture with no lines rolls up to `RM Approval` for
ever.

### Still to run on the live project

`_status.sql` first; row **162**. Then `Spare_1.sql` (0210) — at the repository
ROOT, not in `supabase/apply/`.

---

## 2026-09-16 — The Spare module, documented

*"Add Spare Module -- How it Functions, What are the Fields and Who can Do What
-- Map Both Routes (Call Based, HandStock). Add Approvals, Logic and Also the
Fields involved in every Approval Cycle."*

A second document on **How RITHI Functions**, picked with a chip. The page was
built for one module and now carries two; a third is a file and a line.

Written from the running system rather than from memory —
`spareflow.ts` for the state machine, `SpareRequests.tsx` for the form, the
columns and triggers in `supabase/migrations/` (OR numbering 0017, the stock out
and its challan 0027/0028, the hand-stock balance view, the consumption guard
0059/0060) and `rbac.ts` for the rights.

**The fork is the interesting part**, and it is not where people expect: the two
ROUTES converge immediately, and what actually forks the chain is the **cover**.
WGP and CMC go manager → Stores with Commercial and NSM stamped *Auto-Approved*
in the same write; AMC and OGP bring both in, because those are the covers where
the part is chargeable to somebody. Every HandStock request takes the short
chain — with no machine there is no item status to review.

Two distinctions the document spells out because the screens cannot:

- **Rejected vs Dropped.** An approver refuses a request; Stores declines to
  send an approved part. Both terminal, both need a reason, different questions.
- **Dispatched vs Received.** Stores' claim against the engineer's. The gap is
  stock that has left the building and not been confirmed as arrived.

**A note on who can do what.** The document names the RIGHT for each stage and
says Roles & Permissions is where it is set — deliberately, rather than listing
holders. The CODE defaults and the live rows differ on a project in use, and a
document asserting the defaults would be wrong the moment somebody tuned a role.

`check:ui` now checks the LIST rather than one filename: every document the page
offers must exist, and each must carry the theme hand-off and the height
message. Mutation-tested with a typo'd filename.

Shareable copy: <https://claude.ai/artifact/FS8jQLAENPVwnnmQZgynyz>

---

## 2026-09-16 — The profile emptied itself ten seconds after sign-in

Reported: *"For 1 user alone - in 10Secs, it is going into ? instead of Profile
Details -- User is Deepika, But no matter which user Logins in, it is the
same."* Name and email blank, role fallen back to Engineer, avatar a "?".

**Not the same fault as yesterday.** 0199 fixed a role that was WRONG (User
Master and `profiles` disagreeing). This is the whole identity going blank
AFTER it had loaded, for everyone — a different shape, and the delay is the
clue.

**`sbOnAuthChange` awaited Supabase calls from inside the
`onAuthStateChange` listener.** That listener runs while the auth client holds
its internal lock, and `getUser()` — like any PostgREST read, which needs the
token — waits on that same lock. supabase-js documents it.

It is easy to write by accident because **it works the first time**: the boot
call is outside the callback and returns real data. Only a LATER event goes
through the broken path — and the later event is the automatic token refresh, a
few seconds in. Hence "10 secs", and hence every user on every device.

Two changes, both small:

- The listener hands its work to a fresh task (`setTimeout(…, 0)` — a microtask
  is not enough, a promise continuation can still run before the lock is
  released) and the EVENT is passed on instead of being swallowed.
- `TOKEN_REFRESHED` no longer re-reads the profile at all. It fires on a timer
  and carries the same person every time, so it was a round trip per tick for
  an answer that cannot have changed.

**And the identity stopped lying.** `sbCurrentProfile`'s last resort returned
`full_name: user.email ?? ''` with the fallback role — so where the session
carries no email, a person with no name anywhere: "—", "—", "Engineer", and
nothing saying why. `supabase.ts` condemns precisely that fifteen lines above
the line that did it. They stay signed in (locking somebody out of an app they
can authenticate to is worse), but My Profile now says the profile did not load,
the role shown is a fallback, and the "?" is marked.

**Confidence, stated honestly:** the deadlock is a real defect that matches the
symptom in every particular, but it could not be reproduced from here — there is
no live Supabase in the sandbox. If it recurs, `_profile_names_check.sql` is the
next step: it answers whether the `profiles` row exists at all.

---

## 2026-09-16 — The page IS the diagram, and it is no longer open to everyone

Two asks on one page, a few hours after it shipped.

**"Limit Exposure to Admin, NSM, Zoho, Technical Support."** It shipped
`alwaysOpen` — not a module at all. It is one now, and the thing worth writing
down is what would NOT have restricted it: **removing the menu entry**. The
route still answers, and anyone sent the address still reaches it. The
permission is the restriction; the menu follows it.

`admin: true` on the module keeps the key out of `NON_ADMIN_MODULES`, which
leaves the three roles in `SEES_EVERY_MODULE`; NSM is named in its own defaults.
**0209** is the other half — on a project in use every role has a tuned row, so
`permsForRole()` never reaches the code defaults and the tick grants nobody
anything. That rule is usually quoted about ADDING a page; it applies identically
to narrowing one.

`_status.sql` row 161 checks **both halves**, because "limit exposure" is two
statements: every one of the four holds it, and nobody outside them does. A
migration that grants the four and leaks to a fifth passes every check that only
looks at the four. Mutation-tested in both directions.

**"Is it possible to embed the Artifact? I want the same Look and Feel."**
Not the claude.ai URL — asked directly it answers `x-frame-options: SAMEORIGIN`
and `cross-origin-resource-policy: same-origin`, and the page is private
besides. An iframe at it renders an empty box for everybody but its author,
which is the kind of thing that looks right to whoever built it.

So the document itself lives in the repository at
`public/docs/how-a-call-works.html` and is framed from this app's own origin.
The look and feel is identical because it IS the file. The shared copy is now
**published from that path**, so there is one document rather than two.

What a frame costs is handled: the host's theme is passed in (every app theme
declares `scheme`, so all the dark ones hand it `dark`), the document reports
its own height so there is no scrollbar inside a scrollbar, and a missing
document says so rather than rendering blank.

A guard written for this caught a false positive in itself: the first version
matched `<iframe` inside the comment EXPLAINING why claude.ai cannot be framed,
and failed a file that was correct. It reads `code()` now — a check that treats
documentation as code fails exactly where the reasoning is best written down.

### Still to run on the live project

`_status.sql` first; row **161**. Then `rbac.sql` (0209).

---

## 2026-09-16 — Exporting the matrix, and a topic for "why does it already know that?"

**The permission matrix exports.** One button on Roles & Permissions, available
to a READ-ONLY viewer too — reading the matrix is how somebody answers "why can
this person not see that page?", and that reader is the one who needs to take it
away with them.

Three things the screen says implicitly and a spreadsheet cannot, so the file
says them outright:

- **Admin is Yes everywhere** because Admin always holds everything, not because
  somebody ticked four hundred boxes.
- **A role whose stored list is EMPTY is marked NOT CONFIGURED.** An empty list
  does not mean "no permissions" — `permsForRole()` falls back to the ENGINEER
  defaults, so that role's Yes columns are the fallback, which is what its users
  actually get. Exporting that silently would produce a document wrong in the
  most expensive direction: it would be read as evidence of what is granted.
- **Whether the file contains unsaved ticks**, because exporting mid-edit is a
  legitimate way to review a change before committing it.

A guard caught a fault in my own first draft: the "How to read this" sheet had
`columns: ['', '']`, and `buildXlsx` looks each cell up BY the column name — so
every explanation would have shipped with an empty second column. `check:ui`
now refuses two columns of the same name in any export.

**How RITHI Functions** is the third Knowledge Base topic, and a different
question from How to Use: that one answers *what do I click*, this answers *why
does the form already know that*. **Flow 1** is registering a direct customer
call on New Field Call — which master answers which field, in the order the form
asks, and why the cover arrives locked — with a ledger of all fourteen fields
separating what is looked up, what the database stamps, and the four things
somebody actually types. **Flow 2** is the longer life of a call raised from a
request.

Open to everybody, like the other two topics: not a module, nothing to grant,
and of most use to whoever has just been refused something.

The shareable diagram carries the same two flows:
<https://claude.ai/artifact/1rxueHsny6drq5sun5dvU5>

*Not in `docs/HOW_TO_USE.md`: that handbook covers the modules in `MODULES`, and
this page is `alwaysOpen` and deliberately not one — the same as How to Use and
Field Solutions, which are not in it either.*

---

## 2026-09-16 — Stock Out was empty and told the user to run SQL already in

Reported from use, and two faults stacked — the second worse than the first.

**The register.** `listStockOutLines` ordered by `id`; the view publishes that
column as `line_id` (`dl.id as line_id`). PostgREST does not answer a bad ORDER
with unsorted rows — it answers with an **error**, so Stock Out and the Stock
outs tab came back with nothing at all. Mine, from the paging sweep: the paging
was the right fix and the order column was wrong.

**The hint, which is the one that cost something.** Fourteen screens decided
"this table is missing" by matching `does not exist` anywhere in the error.
Postgres says that about a missing COLUMN too — so the screen read its own
symptom as an absent table and printed *"Stock outs need migration
0027_spare_dispatch.sql"* on a project that had run it months ago. An
instruction that is ACTED ON, sending somebody to re-run a bundle already in,
and teaching them the instruction may mean nothing. Exactly the argument this
project already makes about a `_status.sql` row that answers NO for nothing.

### What now holds it

- `src/lib/dberror.ts` — `isMissingTable()` rules out column, function and
  operator FIRST, then asks whether the message is about a RELATION, then
  whether it is one of THIS screen's. `loadFailure()` gives three answers:
  the migration, a grant, or **the error verbatim** — the real fault was
  readable in the original message and the hint overwrote it.
- `npm run check:orders -- "<psql args>"` asks a database whether every paged
  ORDER column exists — 109 across 53 relations. It has to be a database: the
  column is a string in a chained call, and `dl.id as line_id` reads like an
  `id`.
- `npm run check:dberror` proves the test can tell a table from a column, mostly
  through NEGATIVE cases.
- `check:ui` refuses a bare `does not exist` test in any module.

Nothing to run on the live project: all four are application-side.

---

## 2026-09-15 — Two spellings of one cover, and a page that opened onto nothing

Two reports from use in one sitting, and they are the same shape: something that
LOOKS answered.

**"What is this Warranty?"** Failures per cover read CMC 880, OGP 374, WGP 56,
AMC 3 and **WARRANTY 1**. Not a fifth kind of cover — WGP, spelled differently by
whatever loaded it. On this dimension every number is a `group by`, so a second
spelling does not read as a small error: it **splits the total silently and the
reader believes both halves**. One row was the visible edge of it; the same load
could have carried a thousand.

`public.cover_code()` (0208) is now the one rule, with a trigger on all six
tables that store a cover, and the stored values corrected. Two decisions in it
are the whole design:

- **"OUT OF WARRANTY" must not become WGP.** It contains the word, so a
  substring rule turns one cover into its *opposite* — a worse answer than the
  split it was fixing. The match is on the whole squashed string.
- **An unrecognised value is left exactly as it is.** Forcing it into OGP writes
  a guess into a quality record, and a value that stays odd is what got this
  reported in the first place.

`coverCode()` in `fieldcall.ts` is the same rule on the client, so an import
preview shows what will actually be stored; `check:ui` compares the two lists
word for word.

**"Spare Insights is blank for VPTechnical"**, and then Product Failure Analysis
too. Both pages were in the menu, both opened, both showed zeros — because **the
module key opens a screen and the read policies decide the rows**, and those two
roles passed neither. It is the case the standing rule about Roles & Permissions
does not cover: the screen was granted *correctly*.

0207 merges `data.view_all` and the read gates into `vptechnical` and `rndengg`
alone (the user: *"Never Touch those Roles & Permissions. Modify only the
VPTechnical and RnDEngg Role"*). Read only — not one key granted there writes
anything — and `analysis_roles_test.sql` asserts what it did NOT do at least as
hard as what it did.

### Applied — 2026-09-16

`rbac.sql` (0207) and `data_integrity.sql` (0208) were both run by the user.
`_status.sql` rows **159** and **160** are the standing check.

**What to look at rather than assume.** The backlog is a record, not evidence,
and two things here are only true of the data as it stood when the bundle ran:

- **0207 grants the roles that EXISTED, with a tuned row, at the moment it ran.**
  A role added later — or one whose permissions array is still empty — is not
  reached by it, by design: an empty array means "not configured" and writing one
  key into it would switch the code defaults off. If a third analysis role
  appears, it needs the keys merging in the same way.
- **0208 corrected the cover values stored at that moment**, and the trigger
  holds the line from then on. The one-row `WARRANTY` that started this should
  now read `WGP` on Failures per cover, and the pie should have four slices.

---

## 2026-09-15 — The requirements did not name the Field Call Register

The user asked why registering a field call was not *"called out loud"* in the
requirements. It was — **URS-003**, implemented by FRS-005 and FRS-006 and
proved — but the document filed it under **"not tied to one screen"**.

The grouping is DERIVED from each requirement's own words, and URS-003 says
*"register a customer call"* without ever saying *"field"*. Measured rather than
guessed: **34 of 56 screens had no requirement section at all**, including Spare
Requests, Pending Registrations, the Field Failure Register and Visit Reports.

**My error, and a specific kind of it.** I had guarded the *inverse* direction
loudly — never claim a screen is uncovered, because inverting a strict match
reports every near-miss as a gap (it did once: 31 of 54) — and never checked the
forward one. A guard on one direction reads as a guard on the question.

### What now holds it

`Req.modules` — **derived by default, declared by exception**, unioned rather
than one replacing the other, and each entry says which of the two filed it. 33
requirements carry a declaration with a written reason. That leaves **2 screens
of 56** with nothing filed under them, each with its reason in
`MODULES_WITHOUT_REQUIREMENT`; `check:ui` fails on a third appearing without one,
and on a declaration pointing at a route that does not exist.

And a **traceability matrix** (the user's ask, same day): URS ID, URS Details,
FRS ID, FRS Details, Test Case ID, Test Case Details — **one row per link**, in
`docs/REQUIREMENTS.md` and in the Validation Package. 98 links, 67 requirements
traced end to end. A requirement with no mechanism, or a mechanism with no test,
still gets a row with the gap named in the empty column.

---




## 2026-09-15 — The cards were opening the right page and the wrong list

Caught by checking my own claim rather than leaving it for the user: I had told
them the click-through was the part I most wanted their eyes on. It did not work.

**None of the three registers read `location.state` at all.** The cards passed
`stageFilter`, `status` and `holding`; nothing consumed any of them. So every
card navigated to the right register showing the WHOLE list — **the click looks
answered**, and the reader believes the list in front of them is the one they
asked for. That is worse than a card that plainly does nothing.

**And two cards pointed at addresses that do not exist**: `/hand-stock` (the
route is `/handstock`) and `/material-returns` (`/mrn`). The same strings were
the permission keys, so those two sections would never have appeared for anyone.

### What now holds it

`useArrivingFilter` — one reader, so three registers cannot disagree about how
an arriving filter is applied, and **applied once on arrival**: re-reading
`location.state` would fight every change the reader makes afterwards, and the
screen would appear stuck.

`check:ui` resolves each card's path through `App.tsx` to the module serving it
and proves that module reads the key the card sends. Mutation-tested.

**The first version of that check silently covered two registers of three** —
its `(\w+):` missed the shorthand `state: { status }`, which is how the Daily
Call Review passes it, and the register it skipped was the one most likely to be
wrong. It now asserts the PAIR COUNT first, so a check that stops seeing one
fails instead of passing quietly.

---

## 2026-09-15 — The right chart for each question, and a chart you build yourself

Asked: *"How else do u think we can break down the analysis -- For Root Cause
Pareto makes sense -- but for the rest use appropriate charts. Add a provision
to create a chart by myself and save it."*

### The form is a claim about what is being asked

| | When | Why |
| --- | --- | --- |
| **pareto** | root cause, product, complaint | many categories; the question is which FEW account for most. Ranking is what makes the running share mean anything |
| **share** | cover, spare category | a handful that add up to the whole — COMPOSITION. A Pareto over four slices says only *"these four are 100% of the four"* |
| **ordered** | age at failure, software version | an ORDINAL scale whose own order IS the finding |

**Software version was the one hiding a real fault.** Ranked by count it could
not answer the question anybody asks of it — *does the newer release fail more
than the one before?* It is in version order now, each dotted part compared as a
NUMBER, because a string sort puts `2.10` before `2.9` and would claim a release
order that never shipped.

### The new breakdown: machines that failed more than once

Every other chart answers "which product LINE fails". This answers "which UNIT
keeps failing" — a model with 400 failures across 2,000 machines is a fleet; one
machine with nine is a machine to go and look at. Keyed on **model AND serial**,
because 3,794 serials repeat across models (`src/lib/machine.ts`). The
cross-filter had to be taught that a COMPOSED KEY IS NOT A COLUMN, or the click
would find nothing and the page would silently empty.

### A chart somebody builds and keeps (0206)

**Modelled on `role_table_views` (0120) deliberately** — that table already
answers "this configuration belongs to a role, or to everyone", and a second
answer to the same question is a second set of rules to keep in step.

**Sharing a chart can never share data.** The row holds a DIMENSION and a chart
type, never numbers; the counting happens in the reader's own session over rows
their own RLS allowed. A chart shared with somebody who may see less simply
shows less. That is what makes "share with everyone" safe to offer at all.

**Sharing takes `config.manage`**, the same authority 0120 needs to set a layout
for a role, because it is the same act. Somebody without it is TOLD, rather than
offered the choice and refused afterwards.

### A test that was wrong before the code was

Section 3 expected an ERROR when a caller sends somebody else's `owner`. It does
not error — the stamp trigger runs BEFORE the row-level check and overwrites it,
so the row is filed as the caller's and the check passes. **The test was wrong,
not the code**: discarding is 0113's rule and the better behaviour, because
refusing makes an honest client that sends its own id fail while discarding
makes a dishonest one harmless. What matters is that the row cannot land under
somebody else's name, and that is what it asserts now.

Nine sections, run as `authenticated` — the owner bypasses RLS and would have
reported every hole closed while it stood open.

---

## 2026-09-15 — Renamed to Product Failure Analysis, which is a permissions change

Asked: *"Rename it as Product Failure analysis."* Named for what it analyses
rather than for where the data comes from — and the page had already been
narrowed to exactly that, so the old title had stopped being true.

### A rename is the case the standing rule hides best

**The module key IS the route.** `/dccr-insights` became `/product-failure`, so
the moment the route moved every role's `mod:/dccr-insights` stopped opening
anything — and the page would have gone invisible to all of them **with no error
anywhere**. It is the worst version of that fault, because the screen was
already working for everybody the day before: nobody would have thought to look
at permissions.

0205 merges the new key into every configured role, exactly as 0204 granted the
old one.

**The old key is left in place, deliberately.** It now names a route that does
not exist, so it grants nothing, and `check:ui` ignores a key with no module.
Stripping it would be a second write for no gain — and destructive on a row an
administrator had tuned. 0192 is the precedent: MERGE a renamed module's key,
never swap it.

### And the old address still works

`/dccr-insights` redirects. A screen renamed the day after it shipped must not
turn somebody's bookmark into a blank page. `check:ui` holds both halves — the
redirect and the migration.

---

## 2026-09-15 — DCCR Insights narrowed to product failure analysis

Asked, after seeing the first version: *"Idea is to focus on the product failure
analysis in this new page.. so stick to Pareto, failures per cover.. give data
table, download option, data label toggle."*

**The first version was too wide.** It also answered process questions — who
answered Review 2, how long it took, why a call is still open. Those are good
questions and they are not THIS page's; a page that answers everything is read
for nothing. They are gone.

### The four things are one block

They were asked for together, so they are built together: **`ParetoBlock`**
carries the ranked chart, the **data table** (share and cumulative share), the
**data label** toggle and the **download**. A dimension added later cannot
arrive with three of the four.

### Two judgements worth recording

**The download carries the reviews, not only the ranking.** A ranked list is an
assertion; the rows are the evidence — the user's own ask on FFR Insights
(*"the Raw data of how that Number was arrived at"*). Both products are in it
side by side, as called and as reviewed, so a reader can see which corrections
moved a count.

**Age at failure is NOT ranked, and shows no cumulative share.** Every other
block is a Pareto because ranking is what makes a running share mean something.
Age is ORDINAL: whether failures cluster early or late in a machine's life is
the entire point of that chart, and sorting the bands by count would erase it. A
running total across an arbitrary order says nothing, so there is none. The flag
is in the block and the reason is in the download's method sheet.

### Also

`.linkish` and `.row-on` had no CSS rule — the wart this project keeps finding.
The chosen row **inverts** rather than tints, which is the standing preference
(*"Highlight means CONTRAST, not a tint"*) and works in either theme by
construction.

---

## 2026-09-15 — Daily Call Review Insights, and the correction that reached nothing

Asked: *"In the Overview heading - Add one more analytics page to analyse all the
data that is part of the daily call review -- similar to how FFR Insights are
built. Use all those chart.. analyse and suggest more analytics there."*

### The finding that had to be fixed before the page could be right

**0197's corrected product reached the Field Failure register and nothing else.**
`field_call_review` — the view the Daily Call Review reads, and the one this page
groups by — had no `actual_product` at all. So every "which product fails" chart
would have counted under the MAIN product, and *Change product?* would have
changed nothing on the one screen built to see it: the failure still reading as
EXTEND-XT's when somebody had said it was the CPX CARE's.

0203 carries `live_product_name` — **one effective value**, the corrected product
where one was chosen and the call's where none was, exactly as 0197 argued for
the register. A failure is counted ONCE under whatever that is.

**Two mistakes on the way, both caught by running it:**

- The first version appended with `select fcr.* from field_call_review fcr` —
  **the view selecting from itself.** Postgres accepts that at creation and then
  answers every query with *"infinite recursion detected in rules for relation"*.
- Splicing the new columns in left the previous one without its comma.

The whole definition is restated now, which is the rule this project already
has: a bundle must carry the LATEST definition of everything it defines.
`security_invoker` re-asserted, `check:views` and `check:replay` green.

### What the page shows

Root cause as a **Pareto**; complaint grouping; which products fail; what they
were reported as; cover; the trend with its numbers beside it; where; which
customers.

And four the FFR page has no equivalent of:

| | Why it earns its place |
| --- | --- |
| **Turnaround to Review 2** | in BANDS, not an average — an average hides the tail and the tail is the finding. A review nobody has answered is counted **nowhere** rather than as nought days, which would read as "same day" and flatter it |
| **Who answered Review 2** | including **"Auto (9:15 am)"** — the honest measure of how much of this review a person is doing |
| **Software version** | from the latest visit. A fault clustering on one version is what reaches manufacturing |
| **Age at failure, and why a call is still open** | the two questions the register makes you count by hand |

### Still worth building

Named here rather than guessed at: **warranty-failure RATE per product** (needs
the install base as a denominator, which `objective_evidence` already knows how
to count); **first-visit fix rate** (`visit_count = 1`, by product and engineer);
**a vigilance funnel** — calls → risk to patient → any potential effect → FFR
raised, which is the ISO-relevant chain and currently four separate numbers; and
**review backlog ageing** — not how long an answered review took, but how long
the unanswered ones have been waiting.

---

## 2026-09-15 — My Workload: the queues left the registers, and now open

Asked: *"Remove such cards in Main Views. Move those to a Separate KPI Cards
Page where ever applicable. It should be interactive - Say if i click on
Pending, it should give me the List."* Which cards: **every card off every
register.** What to call it: **My Workload, under Overview.**

### Two facts that shaped it, both from reading before building

**Nothing was clickable.** `KpiCard` had no `onClick` at all — 67 cards across
12 screens. So the interactivity was a new capability, not a wiring-up, and it
belongs in the card: every screen that grows one gets it.

**On Spare Requests the cards duplicated the chips beneath them.** The same six
counts, and the chips already filtered. That row cost vertical space for nothing.

### The cards are two different things

A **queue** has a list behind it and opens the register with that filter. A
**figure** counts units, engineers or days — there is no list of an ageing of
four days — so it opens nothing **and does not look as though it would**. Told
apart by whether `onOpen` is given; an openable card is a real button.

### All Masters keeps its cards

Not an oversight. There the cards **are** the register — one per value list,
which is what the screen is for — rather than a header above a list of something
else. Removing them would leave the page with nothing on it. Guarded, so nobody
"finishes the job" later.

### What the page will not do

- **Count a queue the reader cannot open.** The permission is checked *before*
  the load, so the request is never made. "Spares waiting 240" would otherwise
  tell somebody the size of a queue the register itself would refuse them.
- **Re-derive a count.** Every section uses the register's own helper
  (`summarise`, `deriveStage`, `countCallReviews`). A count that disagreed with
  the list it opens is worse than no count: somebody opens it, finds a different
  number, and stops trusting both.
- **Hide that it is still reading.** Sections load independently — one slow
  register must not hold up six fast ones — and a section that has not read
  everything shows its counts as a lower bound. The Daily Call Review is the
  exception and takes no `+`: `countCallReviews` counts in the DATABASE, so
  "3,850+" would be wrong in the other direction.

### The third thing, which is the one that bites

`check:ui` failed on the first build with *"every module key is written into
app_roles by some migration"* — exactly what it exists for. `permsForRole()`
returns the stored set whenever it is non-empty, so a code default reaches only
a role whose row is empty; without **0202** the page would have been invisible
to every role with no error anywhere. Proved against a database: merged into a
tuned role, skipped one that already had it, left an unconfigured role alone.
`_status.sql` row 156, proved both ways.

### Also

Five computations were left with no reader once the cards went, and were
removed rather than left running.

---

## 2026-09-15 — One Serviceman, changed everywhere it appears

Asked: *"In Party Master - Give me an Option to Change the Engineer Name in one
go - Like Ctrl H."*

This is the repair for the fault measured when the export first arrived, and
left open in the 0200 entry: **32 of the 49 Servicemen match no User Master
name**, and `allocated_to` on a call is a NAME that `notify_call_allotted()`
resolves through `user_directory`. So a spelling nobody holds prefills the box
with somebody who does not exist and notifies no one — **328 customers** on the
worst one (`SIVA KUMAR R.` against `SIVAKUMAR`). Opening 328 parties is not a
repair anybody performs.

### The decisions worth recording

- **ONE STATEMENT.** Every party moves together or none does. A row at a time
  is 328 requests and a half-finished rename if one fails.
- **MATCHED EXACTLY**, never trimmed or case-folded. A rename that quietly
  caught a second spelling would be one nobody asked for — `siva kumar r.` is a
  different spelling and appears on the list in its own right.
- **THE COUNT COMES FIRST.** A count afterwards is a report; a count beforehand
  is a decision. Same rule as renaming a part (0196).
- **THE NEW NAME COMES FROM THE USER MASTER, with no free text.** Letting
  somebody type one recreates exactly the fault being repaired. Clearing it is
  its own tick-box, because `SelectPicker` FILTERS OUT a blank-valued option —
  PickList has its own "— none —" and two of them read as a bug — so an entry
  for it would silently not be there.
- **THE LIST SAYS WHICH SPELLINGS ARE THE PROBLEM**, marked on the spot, rather
  than leaving somebody to compare two screens.
- **COUNTED OVER EVERY PARTY**, through `allRows`. There are 4,752 and PostgREST
  caps a response at a thousand: counting the first page reports 49 names as 20
  and says nothing.

### No migration

It is a plain update through a policy that already exists (`parties_write` is
`has_perm('masters.edit')`), so there is no SQL for the user to run — which
also means the button must be gated in the UI, or it offers something the
database will refuse.

### Proved

Sections 11-13 of `party_kyc_test.sql`: three parties move, the one already
correct is untouched, the differently-cased one is left alone, **a Verified KYC
keeps its stamp** (the rename must not disturb it), and clearing works.
82/82 suites, 13/13 checks.

`.ind-toggle` was nearly borrowed for the tick-box — it lives in a stylesheet
this screen does not import, the same implicit-CSS trap as `kb-form` the day
before. `.kb-check` has a rule of its own.

---

## 2026-09-15 — The filter chips fold away, and never fold the filter away with them

Asked: *"The Grouping at the top ... Seems to be very Congested for a Few but
Useful for a Few — Is it possible to Expand and Collapse it? or Enable /
Disable?"*

Both, and they turn out to be the same control: a row that folds and REMEMBERS
is a row that is disabled for whoever wants it disabled.

### The default is a fact about the row, not a guess about the screen

**A row is congested exactly when it has more options than fit** — three
statuses are useful, ninety engineers are a wall. So a long row starts folded
and a short one starts open, and it follows the data rather than being decided
once per screen. Once somebody touches it their choice wins and is kept, because
a default that cannot be overruled is a preference imposed.

`FacetChips` already had **＋N more / Show fewer** for the overflow past twelve.
That hides the tail; it never made the row smaller than twelve chips, which is
the shape the complaint was about.

### The one rule that matters

**Folding the chips must not fold away the FILTER.** A shut row quietly holding
a selection shows 90 rows where there are 3,850 with nothing on screen saying
why — and the reader concludes the register is broken, not filtered. So the
chosen chip stays out, keeps its count, and clears in one click.

Mutation-tested: removing it fails two `check:ui` assertions.

### Where they are

| Screen | Rows |
| --- | --- |
| Field / Installation / PM calls | Engineer (per call type) |
| Pending Calls, Spare Requests | Engineer |
| Indoor Service | Status, Activity, Kind — **three stacked**, the congested case even though each is short |
| KPI & Failure Analysis | Product, Region |

### Two checks written wrong before they were written right

- `code()` strips comments, so asserting the private-window `catch` by its
  comment matched nothing. Asserted structurally instead — and it now covers
  BOTH accesses, the read at mount as well as the write.
- Counting `storeKey=` to count facet rows measured the wrong thing: **Drawer
  takes that prop too**, so Indoor Service failed a check on a file that was
  correct. Counted by the keys themselves.

---

## 2026-09-15 — A column in the table is not a column on the screen

Reported with a screenshot the moment the Party Master was opened: *"Why is the
party Master not showing any of the Columns?"*

**They were in the database and in the ⚙ picker.** The screen has a CURATED
list — `COLUMNS` in `PartyMaster.tsx` — which is what a reader sees without
asking; everything else on the row is addable but hidden. Adding a column to
`parties` and to the importer put the value in the row and nowhere a person
would look.

**A field nobody can see is a field nobody fills in**, and on KYC that is the
whole feature. `check:ui` now compares the columns 0200 and 0201 added against
the SCREEN, not against the schema.

### And it could not be captured at all

The register was READ-ONLY, so "provision to capture the KYC details" had no
provision. A party can now be opened and edited by whoever holds `masters.edit`:
its contact blocks, the Serviceman, and the KYC.

Two things the form deliberately cannot do, and both are guarded:

- **The party NAME.** Every machine, call and contract names the customer by
  that string and there is no foreign key to `parties` — the same shape as a
  part's identity (0196), which needs a carry-the-history function rather than a
  text box.
- **Who verified the KYC.** The database stamps it; a form that could set it
  could sign somebody else's name to a verification.

### Two more the screenshot showed

- **The count read a flat "1,000"** over 4,752 parties. This register pages a
  thousand at a time, so the badge was a lower bound presented as exact — the
  project's own rule, broken on its own screen. `countMore` now adds the `+`.
- **The picker offered `billing_phone_2`.** `allFields` was passing the raw
  column name as the header, which beats DataTable's own `humanize()`. Dropping
  it gives "Billing Phone 2".

### Also

`kb-form` and `kb-form-actions` reached this screen only because another module
happens to import `knowledgebase.css`. Imported here too: a form that loses its
layout when somebody code-splits the app is a bug waiting for a build change.

---

## 2026-09-15 — The Party Master's own columns, and somewhere for KYC

Asked: *"Additionally add provision to capture the KYC details of the customer.
Clean up the columns, de-dupe the column headers."*

### KYC is a CAPTURE job, not an import one — and the file says so

Counted before anything was designed: `Tax 1` is filled on **5 rows of 4,752**,
`Tax 2` on **1**, `Tax 3` on none. So there is essentially no KYC on record.

Asked which fields to capture, the user said *"I don't know.. there is some
format for KYC, I will update."* **So the fields were not invented.** What was
built is the part that was decided and the part the evidence settles:

- **Every party starts Pending** (the user's answer) — all 4,752, including the
  handful whose GSTIN came out of the spreadsheet. A number on file is not a
  verification, and marking five rows Verified because a sheet had a string in a
  Tax column would be **inventing an audit record**.
- **GSTIN and PAN**, which are statutory and have a shape.
- Who verified it and when are **stamped by the database**, not supplied by the
  caller — 0113's rule for who registered a call. Un-verifying clears the stamp.

The rest arrives as real columns when the format does. A jsonb bag "for the
fields we don't know yet" is what 0148 and 0194 both had to undo.

### The number is found by SHAPE, because the file keeps to no format

`PAN NO:AAACI7716A` · `GST NO:33AADCK3295K2ZB` · `GSTIN:33AAACL7222Q1ZB` ·
`GSTIN: 09AAACI7716A1ZV` — a label, a separator that is sometimes a colon and
sometimes a space, then the number. **A GSTIN contains a PAN** at characters
3–12, so a customer who gave only a GSTIN is not asked for a PAN as well.

**One definition, called by the backfill AND the trigger** — otherwise a file
loaded next year is read differently from the file loaded today, and the
migration's parse would be a one-off that a re-upload silently undoes.

### What the counting decided about the columns

| | |
| --- | --- |
| `Profile` | filled on every row, PRIVATE / GOVERNMENT — and **being thrown away**, because it was an alias of `party_type` behind `Type`. Its own column now, and no longer an alias: on a file with Profile and no Type, both would bind the same heading and `party_type` would come out holding "GOVERNMENT". |
| `Office Name` | our own company on all 4,752 rows. **No column** — one that says the same thing 4,752 times answers no question. |
| `Under`, `Salesman`, `Tax 3` | entirely empty. No columns either. |
| `Tel 1/2`, `Fax`, `Email ID` | **twice each** — one block per address. Named `billing_*`, not numbered. |

### Two faults found by running it, not reading it

- **`Inst. Pincode` and a bare `Pincode`, and the bare one is the BILLING one.**
  `TEXT()` puts the column's own name first in the alias list, so `pincode`
  matched the bare heading and **the installation pincode came out holding the
  billing value**. The pair is only ambiguous in isolation, so the database
  takes the bare one as billing precisely when an `Inst. Pincode` sits beside it
  — a question the ROW can answer and a heading cannot.
- **Round brackets would have broken the billing aliases.** `loose()` strips a
  parenthesised suffix, so the repeated-heading name `Tel 1 (2)` loosens back to
  `tel 1` and the billing alias would have bound to the **installation** column
  — silently, and only on files that repeat. Square brackets survive all three
  passes; proved by asking `findHeader` rather than by reasoning about it.

And the same **`update … from lateral`** trap as 0200, twice more — it cannot
see the update's own target table, and the second time it stopped the migration
*before the function below it was created*.

### Also

`_status.sql` had 22 possessive apostrophes written as `''''`, which renders as
`''`. Tidied; the two places that genuinely want a doubled quote (a nested SQL
string, and a sentence about `default ''`) were left alone.

---

## 2026-09-15 — The Party Master names the engineer, and the request keeps its own

Asked, with the export attached: *"It has to be mapped to Party Master. In Party
Master, my old source has service engineer details. So during any new field call
or Installation calls or PM Call, it has to map the engineer as per the party
master. In case of creating a call from a request, then it has to map it to the
requestor. All the fields to be retained as is."*

### What the file actually holds

`Product Master - PartyMaster.csv` — **4,752 parties, 25 columns**. `Serviceman`
is filled on **4,677** of them, **49 distinct names**. Four headings appear
**twice** (`Tel 1`, `Tel 2`, `Fax`, `Email ID` — once for the installation
address, once for billing).

### Precedence was a question, not a detail — so it was asked

The machine already carries its own Service Engineer and that is what prefills
the box today. Put to the user before anything was built, and the answer was
**the machine wins, the party is the fallback**. So this widens where an
engineer can be FOUND and changes no call that already found one. It matters
most for an **installation**: the machine does not exist here yet, so it can
never name an engineer and the customer is the only thing that can.

For a call registered **from a request**, the answer was **the engineer the
request names** — which is what the request path already did on its auto-fill,
and did NOT do through its picker (below).

### What was wrong underneath

**The request's engineer was being lost.** `PendingRegistrations` spread the
whole product prefill over the form, `allocatedTo` included, on a picker whose
own hint says it is only for correcting party/product/serial. The auto-fill path
never had the fault — `PRODMASTER_FILL` lists the eight cover fields and the
engineer is not one — so it only bit the person who corrected a serial by hand.

**Four columns were reaching nothing at all.** `parseCSV` kept the FIRST of a
repeated heading and DROPPED the rest — right about which one wins, wrong about
the other, on a file whose whole point is that every field is retained. A repeat
is now kept as `Email ID (2)`. It cannot steal a mapped column: `findHeader`
tries `strict` across every heading before `loose`, and only `loose` discards a
bracketed suffix — so the FFR's twice-over `FFR Date` still binds to the real
date, which is why that rule existed.

### Three faults the suite found, that reading would not have

- `update … from lateral (…)` **cannot see the update's own target table**. The
  tidier backfill raised *"invalid reference to FROM-clause entry for table p"*
  and stopped the migration **before the function below it was created**.
- `party_service_engineer()` returned **NULL, not `''`**, for a party nobody has
  recorded — the coalesce was INSIDE a subquery that returns no rows. It passed
  every test written against a party that exists; it failed the case it exists
  to answer.
- `field_calls` has no `serial_number` column — it is `serial`.

### Still open

**The names have to match the User Master, and 32 of the 49 do not** match any
name that has signed in — `SIVA KUMAR R.` against `SIVAKUMAR`, `SINGH VISHAL`
against `VISHAL`, `AAYUSH N SHAH` against nobody. That comparison is against the
**58 people who have signed in**, not the whole directory, so the real figure
needs a query against the live User Master before anyone concludes anything. An
unmatched name still prefills — it is a text box, not a foreign key — but it
will not notify anybody, because `notify_call_allotted()` resolves the person
through `user_directory`.

---

## 2026-09-15 — The one NO on `_status.sql`, and looking before deleting

The status report came back with **161 rows yes and one NO**: row 55, *"handstock:
opening stock is ENGINEERS only"*. It is one of the few rows that tests DATA
rather than an object, so a NO there is not a bundle to run — it means opening
hand-stock rows are filed under names that are not active User Master users.

`_handstock_opening_engineers.sql` is the repair, and it **deleted on the first
run and reported afterwards** — the wrong way round for a removal: by the time
the Messages tab named what went, it had gone.

### A name reaches that list three ways and only one is a dealer

| | |
| --- | --- |
| not in User Master at all | the WinMax dealers and customers — what the file is for |
| in User Master, **deactivated** | a real engineer; this would delete their opening balance |
| in User Master, **different spelling** | a rename, a middle initial, a double space — the same person, and the MATCH is what is broken |

Proved rather than argued: seeded all three beside an exactly-matching active
engineer, and the removal took the deactivated engineer and the double-spaced
name away with the two dealers, leaving only the exact match.

So the file now **looks first**. Section A is one read-only statement naming
every pool that would go **and why it is on the list**; the removal is section
B, commented out, saying in terms that it does not read the reason and that the
second and third rows must be fixed in User Master before it is run. The match
itself is unchanged — `lower(btrim(name))`, which is `handstock_key()`, the key
the balance is grouped on.

Row 55 proved both ways against a database: NO with those rows present, yes once
only the active engineer remained.

---

## 2026-09-15 — Why somebody's chip reads "Engineer" when User Master says otherwise

Reported: *"For a few engineers, it shows a question mark in the profile. This
is user Dipika / Depika - Zoho Migration"*, then *"Why is it showing as engineer
and not Zoho Migration."* Her User Master row reads **Role: Zoho Migration,
Signed in: Yes**.

### Two values answer to the name "role"

| | |
| --- | --- |
| `user_directory.role` | what **User Master** shows. Edited there. |
| `profiles.role` | what the **sign-in** runs on — the menu-bar chip, `has_perm()`, every policy |

`ensure_my_profile()` copies the first into the second **only when it creates
the row** (`if found then return p; end if;`). The only other thing that copies
it is SAVING that person's row in User Master while the email matches
(`UserMasterView.tsx` → `updateProfile(signedIn.id, { role: row.role })`).

So a role changed in User Master **after** somebody first signed in stays in
User Master. The chip is not mislabelling her access — it is reporting it
correctly, and **her access really is the engineer's**, which is why every tile
on her dashboard read 0. User Master is the screen that is out of date.

### The diagnostic could not see its own case

`supabase/apply/_profile_names_check.sql` ended in
`where p.id is null or full_name = ''` — a profile that exists, has a name, and
differs only in its **role** was filtered out. It came back *"Success. No rows
returned"* on a project where the drift was real, which reads as "nothing is
wrong". Rewritten to filter nothing: every `auth.users` row, worst first, with
five verdicts — no profile row / no name (the "?" avatar) / **role drift** / not
in User Master / fine. All five proved to fire against a database.

Section B1 is the bulk repair: copy the User Master role onto the sign-in for
everyone reading ROLE DRIFT. It `join`s `app_roles`, so a typo'd directory role
is refused rather than stranding somebody on a key nothing grants — proved.

### The fix: User Master IS the master (0199)

The user's rule when the diagnosis landed: *"The intent and the fact has to
match 100% — the user master is the only place I can map and configure."*

`user_directory_profile_sync` applies a directory role to the sign-in as it is
written — for **every** path that writes a row, not only the browser's Save.
The drift banner that shipped on 2026-09-11 was a repair for a problem still
being created; **a button that repairs drift is not the same as not drifting**,
because somebody has to open the right screen and notice it, and in between the
application enforces a role nobody chose.

What it deliberately does not do:

- **It never invents a role.** A blank one leaves the sign-in alone, and one the
  matrix does not know is ignored — a typo must grant nothing, not something
  unintended. Same rule `ensure_my_profile()` already used.
- **It weakens no guard.** `profiles_role_guard` (0008) still fires, so changing
  the role on your OWN User Master row is refused and the save rolls back whole
  — the only way the two screens stay honest. Granting `admin` still needs an
  administrator, and a `users.manage` holder who is not an admin still cannot
  reach the directory at all (the address guard). Both proved running as
  `authenticated`, not as the owner.
- **It will not follow a name while two rows share one login.**
  `service.almsind@gmail.com` has two (eBizWiz Admin, WRITE OFF), so "the" name
  for that sign-in has no answer and "WRITE OFF" would have become somebody's
  display name. The role still applies — the duplicates agree about it, and a
  wrong role is *enforced* where a wrong name is only *shown*.

The **Access** drawer now writes the role to the User Master row too, instead of
to `profiles`, so the list and the sign-in cannot end up showing different
things from that side either.

`user_master_sync_test.sql` — 11 sections, mutation-tested by dropping the
trigger (4 sections go wrong and the `expect ERROR` in section 9 stops
arriving). `_status.sql` row 153 tests the TRIGGER, not the function: a function
nothing fires syncs nothing, which is the failure a definition check would miss.

### Applied — 2026-09-15

`rbac.sql` run on the live project, so `user_directory_profile_sync` is live
and `_status.sql` row 153 reads yes. The three findings section A reported were
cleared in the same sitting: the **duplicate directory row** on
`service.almsind@gmail.com` removed, and the two name mismatches (`ajay.g-sc`
*INDOOR SERVICE* → *AJAY G*, `devika.m` *Devika M* → *DEVIKA*) corrected by
saving the rows, which is now all that correcting one takes.

`_profile_names_check.sql` is the confirmation: every sign-in should read
**7 looks fine**, and from here a role set in User Master IS that person's
access, with no button in between.

---

## 2026-09-15 — Frequent failure gains a second rule

Asked: *"For frequent failure - Add more rule. Rule 2, Same Complaint across
same product, but multiple serial nos in the last 30 days."*

### The two rules answer different questions

| | |
| --- | --- |
| **Rule 1** | one **machine** repeating — same product AND serial, on the same complaint or the same part refitted |
| **Rule 2** | one **model** failing the same way on **different units** |

Rule 2 is the fault rule 1 can never see: each of those calls is a *first*
failure on its own machine, so nothing looks repeated even while a whole batch
fails identically.

**It counts DISTINCT SERIALS, not calls.** That is the load-bearing choice —
five visits to one machine are rule 1's finding and must not read as a batch
problem. The same complaint five times on one serial does **not** fire rule 2;
on two serials it does.

**Thirty days, in days.** Rule 1's window is in months because the procedure
says a month; the ask here was thirty days, and those are different lengths in
February. Held as its own setting so changing one cannot move the other.

`is_frequent` is now **either** rule — a rule that did not change the verdict
would be a report — and the verdict says which fired, because the action differs
completely: a unit to sort out, or a batch to investigate.

### ⚠️ A regression caught by comparing, not by reading

`0198` replaces `frequent_failure_rule()` whole. The first draft rewrote
`equipment_needs_complaint`'s truthiness test as `in ('true','t','yes','1')`
while **the stored value is `on`** — so the key silently read FALSE, the
equipment path stopped requiring a matching complaint, and **rule 1 would have
flagged more calls than it does today**. A rule nobody asked to change, changed
by rewriting a line that was only being carried past.

Found by running the function before and after and comparing the output, not by
reading the SQL. The test now asserts it, and `check:ui` refuses the rewrite.

### Also worth recording

The suite failed twice on a database I had hand-seeded earlier — ORION-G 2410
already had a call, so rule 1 fired where the test expected it not to. **That is
why `npm run validate` gives every suite its own copy**, and it is the same
lesson the harness was built on.

### Applied — 2026-09-15

[`daily_review.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/daily_review.sql)
run on the live project, so `_status.sql` row 152 reads yes and rule 2 is
answering alongside rule 1.

## 2026-09-15 — DCCR Review 2: "Change product?"

Asked: *"Accessory Issues are also Logged in the Main Product - Like CPX Care
Failure is logged in Extend-XT or Orion-G … During Review I used to have a
Concept of 'CHANGE PRODUCT?' as part of Review 2, When i can select the Actual
Product [Accessory in this case] and the Failure is included in the Accessory
and Excluded from the Main Product."*

### The ask has two halves, and ONE value satisfies both

*Included in the accessory* **and** *excluded from the main product*. A single
effective product does both by construction: the report is counted **once**,
under whatever that value is. Two columns, or a flag beside the original, would
let a count include it twice or neither — **and a Pareto that double-counts is
worse than one that is merely wrong.** The suite asserts the total is unchanged
for exactly that reason.

### It does not rewrite the call

The call says a machine was down and an engineer went to it. That stays true —
the visit is against it, the spares were issued for it. What the review
establishes is what actually **failed**. `field_failure_register` exposes both,
plus `live_product_changed`, so the difference is visible rather than hidden.

`0197` follows the pattern already there: `live_complaint_grouping` and
`live_root_cause_keyword` are the review's answers read in place of the report's
own, precisely so a judgement corrected later reads corrected everywhere.

### ⚠️ Two things caught by checks rather than by reading

- **The DCCR export is a controlled shape.** Adding `ACTUAL PRODUCT` to it broke
  *"the DCCR export still carries all 53 of WRR-2026 columns 15-67"* — the
  export mirrors a controlled form and is not a place to add a column. Reverted.
- **`create or replace view` can only ADD columns**, so 0197 widening the view
  made 0167's narrower definition fail on replay with *cannot drop columns from
  view* — `npm run check:replay` refused the bundle. Both definitions now drop
  first, which is the property a bundle needs: a statement true whatever shape
  the view is in when it runs. Nothing depends on that view — asked of the
  database (`pg_depend` over `pg_rewrite`) rather than assumed.

### The list offers retired lines too

`active` stops a **new sale entry** and nothing else. A failure can be on an
accessory no longer sold, and refusing to record it would lose the finding
rather than the sale.

### Applied — 2026-09-15

[`daily_review.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/daily_review.sql)
run on the live project, so `_status.sql` row 151 reads yes: Change product?
now moves the failure, rather than saving while nothing moves.

## 2026-09-15 — The validation run goes green, and what was wrong was the tests

Phase E of *"Test it, record the bugs, Fix it, update relevant documentations
then re-test"*. **77/77 suites and 13/13 checks.** Eight were failing and **none
of them was a fault in the application.**

### Four were the harness

| | |
| --- | --- |
| `expect ERROR twice` | counted as ONE expectation, so the second error read as unexpected — audit_mode, spare_bulk_decisions |
| consecutive labels | one explanation over three `\echo` lines, EACH prefixed `expect ERROR`, counted as three expectations for one error — indoor_service |
| `check:columns` | invoked with no connection arguments, printed its usage, recorded as a failure |
| `check:safe-updates` | handed psql arguments it read as a DIRECTORY |

### Three were tests that had stopped testing anything

- **`ffr_import`** upserted `on conflict (ffr_no)`. `0181` widened the key to the
  report **and the machine** — one report can cover several — so from then on
  section 4 raised *"no unique or exclusion constraint matching the ON CONFLICT
  specification"* and the re-load was never exercised.
- **`spare_insights`** still asserted a closed category vocabulary. `0152`
  **deliberately dropped** that constraint after a real Item Master load aborted
  at row 174 with 173 rows already written. The test expected an error that
  could no longer happen, raised none, and ran clean.
- **`ownership_transfer_same_party`** section 5 gave neither hand-over an OT
  number, so the second collided on `('', 'OT-C')` and the section had never run.

The pattern is one thing: **when a migration replaces a decision, the test has
to move with it** — the same rule `CLAUDE.md` already states for `_status.sql`.

### ⚠️ And one finding that outlives the test run

`_status.sql` row 47 answered NO on every harness run and yes on any real
database. The cause matters more than the symptom: **`alter database ... set
jit = off`** (0099, the Hand Stock timeout — 3.7 seconds *compiling* a query
that runs in 174ms) lives in `pg_db_role_setting` **keyed by the database OID**,
and `create database ... template x` gets a new OID and none of the settings.
Proved by asking: the original reads `jit=off`, the copy reads nothing.

**Any rebuild of the live project that copies or restores rather than re-running
the migrations silently loses it**, and the Hand Stock timeout comes back with
nothing to say why. Recorded in `CLAUDE.md` and as defect D-014.

### Nothing to run on the live project

Tests, harness and documentation only.

## 2026-09-14 — Part Master: renaming a part carries its history

Asked: *"I need to be able to Edit Part Master - Bulk upload to edit it or
Individual Item edit as well."* Then, put to the user before building because
the two readings are very different work: **"Rename carries the history."**

### Why this was not a two-column update

A part's identity here is the STRING `CODE|Description`, and **nothing in the
database has a foreign key to `public.parts`**. Measured rather than assumed:
**nine tables** carry that string as a value — `spare_consumption`,
`spare_consumption_history`, `spare_issue_history`, `handstock_opening`,
`spare_request_lines`, `spare_dispatch_lines`, `stock_transfer_lines`,
`material_returns`, `indoor_job_parts`. (The dozen `part`/`part_code` columns on
views derive from these and follow on their own.)

**Hand stock is derived, never stored.** So renaming the catalogue row and
leaving those nine behind does not merely lose a link: an engineer's BALANCE
CHANGES, because the consumption lines stop matching the issues. A rename is all
nine or none, which is what one function in one transaction buys.

Also found: **a re-upload with a corrected description silently creates a second
part**, because the changed description is a changed key. Reported to the user;
the individual rename is the fix that actually works today.

### ⚠️ The exemption had to be unforgeable, and the first version was not

`consumption_adjust_guard()` (0062) refuses any change to a consumption line's
part — correctly: that is a quality record being re-pointed. A rename is not
that, so the guard had to learn the difference.

The first version declared the rename in a transaction-local `set_config`.
**Tested, and it was a hole**: `set_config` is callable by anybody, so whoever
could update a line could set the flag and re-point it — exactly what the guard
exists to prevent. Proved by doing it before it shipped:

```
begin;
select set_config('app.part_rename', <old>||chr(10)||<new>, true);
update spare_consumption set part = <new> ...;      -- UPDATE 1.  Wrong.
```

**A flag is a suggestion; a row in a table nobody may write is a capability.**
`rename_part()` files a ticket keyed on `txid_current()` into
`part_rename_ticket` — RLS on, **no policy**, no grants — and the guard admits a
part change only where a ticket for this transaction names exactly that
substitution.

And the retest had to be run **as `authenticated`, not as the owner**: the owner
bypasses RLS and would have reported the hole closed while it was open.

### Proved

`supabase/tests/rename_part_test.sql`: the engineer's balance is identical
before and after (including a history row stored with different spacing and
case, which a raw-string match would have left behind); nothing still names the
old string; the ticket is spent; a merge is refused; and re-pointing a line by
part, engineer or UCN is still refused, flag or no flag.

`_status.sql` row 150 answers NO if the function is missing **or if a policy is
ever added to the ticket table** — mutation-tested both ways.

### Filed in `handstock`, not `masters`

Though the Part Master is a master. It redefines `consumption_adjust_guard()`,
which 0062 and 0081 define in `handstock`, and `masters` runs BEFORE `handstock`
in `ALL_ORDER` — so filing it with the Part Master would have let that module
put the old guard back on a fresh apply. Same rule as `0055`.

### Still to do

**Bulk-upload editing.** Re-uploading corrects category, family, cost and active
on a matching part, but a changed description creates a second part rather than
renaming the first. The importer should recognise a probable rename and say so
rather than silently inserting.

### Applied — 2026-09-15

[`HandStock_X.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/HandStock_X.sql)
run on the live project, so `_status.sql` row 150 reads yes and Edit works on a
part that has history.

⚠️ **AT THE REPOSITORY ROOT, not `supabase/apply/`.** The handstock module is
written out as `HandStock_X.sql`, one of the two numbered consolidated files
handed round. This entry first linked it under the apply folder with the module's
own name, which does not exist there — the identical 404 CLAUDE.md already
records, made again by somebody who had read the note. `check:ui` caught it
before the user ran it; the wrong link had already gone out in the pull request
body for #346, and was corrected in the chat.

(The bad path is described rather than quoted here on purpose: that check reads
TEXT, not intent, so a note naming the broken link would fail on itself for
ever — which is how a check ends up being switched off.)

## 2026-09-14 — A correction at source that the upload could not carry

Reported with a screenshot of the app and of the SOURCE MASTER: **ORION-G 2410**
showing contract **MC5521**, *"completely wrong"*.

**Two machines share serial 2410** — a CPX CARE (`PRD-007-W-220-G`) and an
ORION-G (`PRD-009`) — and MC5521 with its CMC dates belongs to the CPX CARE.
The user fixed the master at source. **Re-uploading it changed nothing**, and
that is the defect.

### A blank cell was indistinguishable from an absent column

The shaper wrote a column only when the cell had a value:

```ts
if (val !== null && val !== '') out[col.to] = val;
```

So two cases produced the same payload — no such key — while meaning opposite
things:

| the file | means | did |
| --- | --- | --- |
| does not carry the heading | leave the column alone | leaves it alone ✓ |
| carries it, cell empty | **empty the column** | leaves it alone ✗ |

An upload could therefore only ever **add** a value, never **remove** one.
Proved against Postgres before changing anything: seed the row as the screenshot
shows it, apply the upsert the corrected file produces, and `MC5521` is still
there afterwards.

### The fix

`blanksClear` on an `UploadDef` sends the empty value (`''`, or `null` for a
typed column) when the file CARRIES the heading and the cell is blank.
**Opt-in per register**, and `products` is the only one that has it: it is right
where the file is the machine's WHOLE ROW — the v2_ProdMaster export carries all
32 headings on every row — and wrong where somebody may load a partial file
whose tool emits every heading regardless. A **stamped** column is never
blanked, nor a **required** one (that row is held back, which is louder).

End-to-end against Postgres: ORION-G's contract clears, **the CPX CARE's own row
is untouched**, and each keeps its own warranty.

⚠️ **A TDZ bug `tsc` could not see.** The guard needs `stamped`, which was
declared BELOW the shaping loop in the same function — reading it from the loop
would have thrown *Cannot access 'stamped' before initialization* at RUNTIME.
`tsc --noEmit` passed. Moved above both readers.

### What this means for the data

**No repair SQL.** Re-uploading the corrected master now fixes every affected
machine at once, not only the one that was noticed — which is the point of
fixing the importer rather than patching one row.

### Nothing to run on the live project

Application code only — no migration.

## 2026-09-14 — "Old bugs have surfaced": the 1,000-row cap, in twelve places

Reported with a screenshot: **Product & Party Search, ORION-G (2547)**, serial
box typing `2410` → *"Nothing matches"*, footer *"0 of 1000"*. The screenshot is
the reproduction: 2,547 machines on the register, exactly 1,000 options offered.

**PostgREST caps a response at 1,000 rows however large the `limit` says, and it
says nothing when it trims.** `sbListProductSerials` asked `.limit(20000)` and
got a thousand. The count beside the product name was RIGHT — it comes from a
view that aggregates server-side — which is what made the picker look broken
rather than short.

### It had been diagnosed once, and fixed in one place out of thirteen

`listCallRequests` carries a comment saying precisely this, written when the
Request Registration register showed a thousand of four thousand requests. The
fix went into that one function. The same `.limit(n)` stayed in twelve others
and came back a year later as a new bug report.

| paged now | what a cap did there |
| --- | --- |
| `sbListProductSerials` | **the reported one** — 1,000 of 2,547 serials |
| `sbListPartyItems` | a hospital group's machines, cut at 1,000 |
| `sbListPartyProducts` | which products a party owns |
| `sbListProductNames` (fallback) | **wrong machine COUNTS**, not just a short list |
| `listOwnershipTransfers` | transfers past the first 1,000 invisible |
| `listAdditionalEntries` | same |
| `sbFailureModes`, `sbSpareUsage`, `sbFailureRates` | aggregates behind the Insights charts — a trimmed total is a **wrong number on a chart** |
| `unusedSpareEngineers` | engineers missing from a filter |
| `user_directory` name check | **worst of the set**: it decides which uploaded Hand Stock rows are KEPT, so a name past the first 1,000 would have had that person's stock thrown away as "not a user" |

### Two things the fix had to get right

**Order is not optional when paging.** Without a deterministic order PostgREST
may return page 2 overlapping page 1, and a row is then doubled or dropped —
worse than truncation, because the result looks complete. Every paged read names
one: the primary key where there is a table, the grouping columns where it is a
view with no key. `listAdditionalEntries` ordered by `created_at` alone, which
is not unique, so `id` was added beside it.

**The pager had to be testable.** `supabase.ts` reads `import.meta.env` at load
and **no node script can import it** — which is why every check in this repo
reads it as TEXT. So `allRows()` lives in `src/lib/paging.ts`, with no Supabase
in it, and `npm run check:paging` runs it against a fake server that HONOURS THE
CAP. That test includes 2,547 rows by name, because that is the number in the
report.

Mutation-tested: five mutations of the pager (never stops early, only ever
fetches one page, ignores the caller's cap, swallows a failing page, wrong page
size) and all five caught; plus the `check:ui` guards against a new
`.limit(n > 1000)` and against a paged read with no order.

### Nothing to run on the live project

Application code only — no migration.

## 2026-09-14 — Roles & Permissions: the step that kept being missed

Asked, as a standing rule: *"Update the Roles & Permissions - Always when a New
UI is introduced or when a UI is re-arranged -- This is often missed."*

It had been missed **four times**, and the audit found them by asking the code
rather than by reading this file.

### What was actually broken

| | |
| --- | --- |
| `mod:/machine-history` | **no migration ever granted it.** No parent key either, so nothing stood in. |
| `mod:/exports/calls` | no migration. Covered for a role holding `mod:/exports`, not otherwise. |
| `mod:/exports/feedback` | as above. |
| `/machine-history` in `PERM_TREE` | still under a header of its own after v0.9.254 moved the screen to **Overview** on the menu. |
| header order | matrix had Reports before Indoor Service; the menu has them the other way round. |

**Why a code default is not enough, and this is the heart of it.**
`permsForRole()` is `if (stored && stored.length) return stored;` — the
`DEFAULT_PERMS` fallback applies ONLY to a role whose `app_roles` row is EMPTY.
On a project in use every role has a tuned row. So a new module's key reaches
**nobody** until a migration puts it there: the screen ships, the menu entry
exists in the code, the permission is ticked in `DEFAULT_PERMS`, and the page is
invisible to all twelve roles **with no error anywhere**. `0195` is the repair.

`0155` shows the second-order version: it gave `zoho_migration` the report
sub-pages one by one (`consumption`, `kpi`, `unused`). A list written out in
full is a list that goes stale, and the two reports added on 2026-09-14 are not
in it.

### ⚠️ A comment claiming a check exists is worse than no comment

`rbac.ts` said *"check:ui compares the two on every run"*. **Nothing read
`PERM_TREE` at all.** That sentence is why nobody looked, and it is why a screen
could move groups and leave its permission entry behind for two days. The check
exists now and enforces coverage both ways, the header each page sits under, the
order of headers and of pages, the label, and whether a migration ever grants
the key.

Two things that came out of testing it rather than writing it:

- **A false NO.** The first version looked only for `'mod:/x'` and reported
  `mod:/call-review` ungranted; `0163` grants it inside a jsonb literal with
  double quotes. Fixed before shipping — a row that answers NO when nothing is
  missing is worse than no row, because somebody acts on it.
- **A dead assertion, removed.** "Every module is held by some role in
  `DEFAULT_PERMS`" could not fail: `DEFAULT_PERMS` is DERIVED from `MODULES`, so
  every module is in the admin's list by construction. Deleted rather than left
  green — a tick that can never go red is what let this area drift.

Every live assertion was mutation-tested, including the guard that stops the
menu-parsing regex from silently matching nothing and making the rest vacuous.

### To run on the live project

[`rbac.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/rbac.sql)
— `_status.sql` row 149 answers NO until it is in, and until then those three
screens stay invisible.

## 2026-09-14 — Product Database and Product Master: the names swap

Asked: *"Rename Product Master to Product Database -- Deep dive and Rename all
instances"* and *"Add a Separate Product Master - Which is the Actual List of
Product Lines … All Inactive Products can never have a new Sale Entry, But can
still have Contract or Calls or Basically everything other than New Sale Entry"*.

| | table | one row per | label | route |
| --- | --- | --- | --- | --- |
| install base | `public.products` | MACHINE | **Product Database** | `/product-database` |
| catalogue | `public.product_master` (0193) | PRODUCT LINE | **Product Master** | `/product-master` |

**The table is not renamed.** `products` is referenced by 24 views, a dozen
functions and every screen; the NAME the user reads is the module label, and
renaming the table would be a day's work for nothing. The table names now read
backwards against the labels — recorded in `CLAUDE.md` so the next reader is not
caught by it.

**The permission had to move with the screen** (0192). The module key *is* the
route, so giving the catalogue `/product-master` without moving the audience
would have left every role holding `mod:/product-master` silently losing the
install base and gaining the catalogue — same key, different screen, nothing on
screen to explain it. 0192 merges `mod:/product-database` into every role that
had the old key; all 12 verified.

**Keyed on the CODE, measured not assumed**: the user's ProductList export has
53 rows, **53 distinct codes and 43 distinct names**. CPX CARE alone has nine
codes and they disagree about being active, so a rule on the name would be wrong
eight times on that product. Verified against the real file: by name CPX CARE is
sellable (some code is), ORION is not (all inactive), ORION-G is.

**The rule is on the FORM, not a trigger**, and that is a decision: a trigger
would also refuse the historical sales import — 30 of the 53 lines are retired
and those sales happened. Refusing them would make the register unloadable. The
Sale Entry picker offers active lines only and says how many are retired;
free text stays open, because a hand-maintained catalogue must not be able to
stop a real sale. `product_line_sellable()` is the same rule in SQL and treats
an UNKNOWN code as sellable.

⚠️ **A trigram index written by habit.** The first draft put `gin_trgm_ops` on a
53-row table — copying the party-cascade note in `CLAUDE.md`, which is about a
table with thousands of rows. `check:replay` refused the bundle outright
(`operator class "gin_trgm_ops" does not exist`), because `all.sql` builds its
database before any migration creates the extension. Removed: Postgres scans 53
rows whatever is on them, so it bought a dependency and nothing else.

### The third part — every column retained (0194, shipped)

*"Product Database has to retain all Columns - Attached a Sample.
[v2_ProdMaster (1).csv]".*

Measured against that sample rather than guessed: **32 columns, eleven of which
had a column here**. The other twenty-one were never lost — the importer is
`extraInto: 'extra'`, which keeps every unnamed heading verbatim — but a value
in a jsonb blob cannot be sorted, filtered, grouped or shown as a column. It was
present and unusable, the same fault 0148 fixed for the Part Master.

So the migration **backfills** as well as adding columns: every machine already
loaded carries these values in `extra` right now, and nobody should have to
upload again to reach what was already kept. `extra` is read, never written.

Three are not simply text, and each was a decision:

| column | why |
| --- | --- |
| `item_code` | The Product Database **had no product code at all**. It is what joins a machine to its line on the Product Master (0193) — the one that does work rather than display. |
| `warranty_status_keyed` / `contract_status_keyed` | The export's OWN `ACTIVE`/`INACTIVE` words. **Not** the state this system computes from the dates; `_keyed` so the two can never be mistaken for one another. |
| `pm_visits` | An integer, because it is counted. A blank stays NULL: on a service schedule *"nobody said"* and *"none"* are different answers. |

**`Item Code` was already a column on the screen and always came back blank** —
nothing ever filled it, because neither the importer nor `productRowToSheet`
knew the heading. That is what the user saw as *"some discrepancies in Product
Master but my Source is correct"*. `check:ui` now refuses any column the
importer fills that no screen can read.

⚠️ **A typed column silently ate what it could not read.** Found while doing
this, not guessed: `shapeUpload` kept a value when NO column claimed the
heading, and kept it when a column REFUSED it (`col.when`) — but dropped it when
a typed column claimed it and `coerce` answered null. The sample's own
`INST Date` says `To Check`. So the moment that heading stopped being loose text
and became a date, a year of unreadable PO and INST dates would have vanished on
the next upload, having been safe in `extra` all along. Backwards: an unreadable
cell is the one somebody most needs to SEE. Fixed for every register, not only
this one.

The dates in the backfill are **guarded on their shape** (`02 Sep 23`) because
`to_date('31 Febbb 24','DD Mon YY')` does not return null, it RAISES — one bad
cell in twenty thousand would have failed the whole migration. Verified by
asking Postgres rather than by reading the docs.

### Found in passing, NOT fixed here — a test section that never runs

`ownership_transfer_same_party_test.sql` **section 5** ("a chain loaded in date
order still records each hop") stops at line 57 with *duplicate key value
violates unique constraint "ownership_transfer_key_uniq"*, which is
`(reference_no, serial_number)`. Both of its inserts omit `reference_no`, so the
second one collides with the first on `('', 'OT-C')` — the section has never
actually tested anything, and the error carries no `expect ERROR` label, which
is how it went unnoticed.

**It predates this change**: reproduced on `main` with these commits stashed,
same line, same error. Left alone rather than fixed in a migration change that
has nothing to do with it — the fix is to give the two rows their own OT
numbers, which is a one-line edit in that suite. Recorded here so it is not
found again from scratch.

### Verifying it landed — `_status.sql` row 148 is not enough

Row 148 asks whether the twenty-one COLUMNS exist. **A column can exist and be
empty on every one of twenty thousand machines**, and the backfill is the half
that can silently do nothing — it fills only a column still EMPTY, it reads
`extra` and never writes it, and the two dates are guarded on their shape. The
Supabase SQL editor does not show a `raise notice`, so the migration's own
"N machine(s) had their kept columns read back out of `extra`" is invisible
there.

[`_product_database_check.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/_product_database_check.sql)
(read-only) asks the rows themselves: per column, how many machines have a value
in the COLUMN, and how many have one in `extra` that did **not** reach it. Every
text column should read **0** in that second number. Where `PO Date` or
`INST Date` do not, those are cells the parser could not read — the sample's own
`INST Date` says `To Check` — and they are not lost; the file's own words are
still in `extra`.

Proved both ways against a throwaway Postgres carrying rows in the pre-0194
importer shape: before the backfill every value showed as "still only in extra"
except the two corrected by hand; after it, **0** for every text column, 1 for
`pm_visits` (`three`), 1 for `po_date` (`31 Febbb 24`) and 2 for `inst_date`
(`To Check`) — exactly the cells the guards exist for.

### To run on the live project

`masters.sql` was run by the user on 2026-09-14, carrying 0194. Nothing is
outstanding; confirm with `_status.sql` row 148 and the check above. (Row 147's `masters.sql` +
[`rbac.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/rbac.sql)
were run by the user on 2026-09-14; `masters.sql` now carries 0194 as well, so
running it again brings both.)

**The application does not wait for it.** `productRowToSheet` reads the column
first and falls back to `extra`, so every screen shows what it showed yesterday
until the migration lands, and shows the columns afterwards.

## 2026-09-14 — Machine History: one machine, across every register

Asked: *"Analyse ORION-G - 2141 -- Where is the Product? Fetch all Transactions
of this Product"*, then *"Build me in UI Also … Calls , Spares , Visits ,
Warranty , Contract , Ownership Transfer -- If i am missing anything add"*.

**Four were missing from that list** and a machine has all of them: **Field
Failure Reports, customer feedback, additional entries and workshop (indoor)
jobs**. Ten registers in total.

Two ways in, both keyed the same:

- `supabase/apply/_machine_history.sql` — one read-only statement for a one-off
  look, pure SQL for the SQL Editor.
- `/machine-history` — the screen, under Quality & Analytics. **Not** under
  Reports: a report is a file you take away, this is a thing you look at.

**PRODUCT FIRST, THEN SERIAL, and changing the product clears the serial.** The
serial is what the database is queried on (it is indexed); the product is
checked in the page afterwards, because no index can do that half. Both use
`machineKey` from `src/lib/machine.ts` rather than a private comparison — the
rule exists because an ORION-G 201 request was once offered an open call for a
VEGA 201, and 3,794 serials appear on more than one model.

Three decisions worth not undoing:

- **Every row names its register.** They are filled by different people under
  different policies; one undifferentiated list would promise the same standard
  of evidence for all ten.
- **A register that refuses does not empty the page.** They are read in
  parallel and a reader may hold rights to some and not others, so a failure on
  one drops that register's rows and keeps the rest.
- **An undated row sorts last, not first.** Putting it at the top would read as
  the most recent thing that happened to the machine.

A machine the Product Master has never heard of still has a history, and the
screen says so rather than looking empty — that gap is itself a finding.

⚠️ **Overlaps [PR #328](https://github.com/neurolooom-eng/RITHI_CRM/pull/328)**,
the draft Product History screen from another session, which covers calls,
visits, parts and cover AND reaches the pre-2016 archive project. This one is
live-data-only and covers ten registers. They will collide; #328 isolates its
archive access in `src/lib/archive.ts`, so that half can be layered onto this
screen rather than the two being merged. **The user's call.**

## 2026-09-14 — A wrong file in the DCCR register

Asked: *"I uploaded a Wrong file in DCCR -- How to delete it?"*

`supabase/apply/_dccr_undo.sql` — **diagnostic first, delete commented out.** The
obvious answer (delete the rows) is right for some of them and destroys real work
on the others, and **`call_reviews` has no history table** to undo that from.

The DCCR upload is an UPSERT on the UC Number, so one file did two things:

| | what happened | what to do |
| --- | --- | --- |
| `created_at` **inside** the window | the review did not exist before | safe to delete |
| `created_at` **before**, `updated_at` inside | an existing review was **overwritten** | **do not delete** — load the correct file, which writes them back |

Deleting an overwritten row throws the review away as well, and the previous
answers are not recoverable from anywhere.

**And the third thing, which nobody expects:** a review whose answers make *Any
Potential Effect* YES **raises a Field Failure Report** by database trigger
(0167). A wrong file can therefore have created FFRs, and deleting the reviews
does not remove them. Section 3 lists them, identified by the rule they record on
themselves (`extra->>'raised_by_rule'`). They are quality records and the file
does not offer to delete them — an FFR that should not stand is *cancelled* on
the register, which keeps the record and marks it.

**Tested against a simulated bad upload** rather than reasoned about: one
pre-existing review overwritten, two inserted, one FFR raised. The diagnostic
separated all three; the delete removed exactly the two inserted rows and left
the overwritten one and the FFR alone. Mutation-tested — dropping the
`created_at` guard and keeping only `updated_at`, which is the obvious wrong
version, deletes all three.

⚠️ **`call_reviews` has no history and no delete block**, unlike
`field_failure_reports` (0049) and `ffr_history` (0174). That asymmetry is worth
a decision: the DCCR is a quality record too.

### "Delete all UCN which is not starting with 26 in DCCR"

Asked as a ONE-OFF after the wrong file, and scoped by the user in the same
breath: *"this is specific to DCCR Only and not any other tables"*.

The UCN is `<YY><MonthLetter><DD><TypeLetter><Seq4>` (0001), so the first two
characters ARE the year — `26%` is 2026 and everything else is older. Verified in
the generator rather than inferred from the examples. `ucn` is the PRIMARY KEY
and NOT NULL, so there is no blank case to reason about.

`_dccr_undo.sql` gained two sections: **A** breaks down what would go, by year
and by where it came from (created by the upload / existed before it / ever saved
by a person / has a Field Failure Report); **B** is the delete, rolling back as
written.

**It is wider than "undo the upload"** and section A is how that is seen rather
than discovered: it removes every pre-2026 review, including any that were there
before the file — the 23 overwritten ones among them.

A review is deleted; its FFR is not. Nothing cascades from `call_reviews`, so an
FFR raised from a review removed here stays on the register — right (a quality
record is cancelled, never deleted) but it means the two registers will disagree
about whether a review exists. Section A's last column counts them.

**Proved on a fixture with real-format UCNs across three years**: section A
grouped them correctly, section B removed exactly the pre-2026 rows, and
`field_calls`, `pm_calls`, `installation_calls`, `field_failure_reports` and
`audit_log` were all unchanged — which is the user's scoping requirement, tested
rather than asserted. `check:ui` now refuses a `delete from` in that file
targeting anything but `public.call_reviews`.

(A fixture note: the three call tables have a CHECK that a row's `call_type`
matches the table it is in, so the PM and Installation calls had to go in their
own tables. The first attempt put all five in `field_calls` and was refused —
the constraint doing its job.)

### "What are those 23 Entries?"

The live report came back **28,120 created · 23 overwritten · 0 FFRs raised**.
The 23 are the reviews that existed before the upload and were written over —
the only ones where anything was lost, and the reason the delete must not touch
them.

`_dccr_undo.sql` gained a second query for exactly them. **What they said before
is not recoverable**: `call_reviews` has no history table, and the audit log
records THAT a review was saved (the UCN, who, when) and never the answers.

But the audit log answers the question that decides what to do — **did a person
ever review this call in the app?** A row with an audit entry is human work
overwritten, to be re-loaded or re-entered; a row with none came from an earlier
upload and re-loading the correct file restores it with nobody having to
remember anything. And re-loading only fixes the UCNs the good file actually
contains, which the query says per row.

⚠️ **Testing found a real bug in that query, not just in the fixture.** The audit
join first read `l.at < win_from`, and the window is a day wide — so a person
who reviewed a call at 10am and an upload that ran at 3pm are both inside it, and
the entry proving human work would have been missed. It tests `l.at <
r.updated_at` now: before THIS ROW was overwritten, which does not depend on the
window's granularity at all.

Also learned while testing: `audit_log.at` and `call_reviews.updated_at` are both
stamped by triggers (`audit_biu`, `call_reviews_stamp`) and cannot be set by an
insert or update. That is right — an audit entry should not be backdatable — and
it is why the fixture had to be built around them rather than against them.

### It shipped unable to run where it is run

Reported immediately: `ERROR: 42601: syntax error at or near "\"` on line 44.
The first version used psql's `\set` and `\echo`. **The Supabase SQL Editor is
not psql** — and that editor is where every file in `supabase/apply/` is
actually pasted, because it is the link the user is handed.

Every other file in that folder was already plain SQL, so the convention existed
and was simply not written down anywhere a check could see it. It is now: a
`check:ui` guard refuses a psql meta-command in any hand-run SQL file
(`supabase/apply/*.sql` plus the two consolidated files at the repository root).
It matches a backslash at the START of a line only, so the regex backslashes
inside ordinary SQL — `or_no ~ '^OR-\d\d/\d\d/'` in `_status.sql` — are not
flagged; that false positive was checked for rather than hoped against.

Rewritten as ONE statement returning a summary and all three sections in a single
grid, which is what that editor shows.

## 2026-09-14 — Call Report and Customer Feedback Report

Asked for: *"Add Call Report , Customer Feedback Report -- Follow the Same
concept of Consumption Report."*

**"The same concept" is four properties, not a layout**, and each is a thing that
has to stay true on every report rather than on the one somebody remembered:

1. the filter runs in the **database** — every one of these registers pages, so a
   browser-side filter reports on the first thousand rows and calls it the answer;
2. the mandatory columns are shown **ticked and locked**, not hidden — a column
   absent from a picker reads as an oversight, one visibly locked reads as a rule;
3. the column order is the **view's**, not the click order — a file whose columns
   move between downloads is one nobody can build a formula against;
4. the file carries its **own scope** on a second sheet.

So `ReportBuilder` holds all four and **the consumption screen was converted onto
it too**. Three copies would have been three chances to lose one quietly, and the
likeliest casualty is (1), because fetching and then narrowing *looks* the same
until the register passes a thousand rows.

`0191_call_and_feedback_reports.sql` adds both views, `security_invoker` on both
— a report view running as its OWNER hands every call in the company to anybody
who can open the screen, and this project has shipped that fault twice.

**Call Report is ONE ROW PER CALL**, never per visit: a call with four visits is
one call, and a report repeating it four times would have every count in it
wrong. The latest visit is the latest ENTRY, matching `sync_call_last_visit()`.

**The feedback questions are the export's own headings**, measured against the
user's file rather than invented:

| asked of | questions | rows |
| --- | --- | --- |
| every visit | Operating Feasibility, General Support | 24,748 |
| a PM or field visit | four more | 23,759 |
| an installation | four different ones | 1,009 |

So **a blank is not a missing answer** — it means the question was not put — and
the file says so, because a reader sorting a spreadsheet cannot tell otherwise.
`Month`/`Year`/`Quater`/`Half-Yearly` are deliberately not carried: they are the
date restated, and a period column that can disagree with the date beside it is a
liability in a file somebody sorts.

Each report is its own permission key inheriting from `mod:/exports`, so a role
can be given one without the others.

### To run on the live project

[`performance.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/performance.sql)
— `_status.sql` row 146 answers NO until it is in.

## 2026-09-14 — The feedback date, and a Pareto that drills

### Every uploaded feedback read as the day it was uploaded

Reported from use: *"I think the Date is taken as 14Sep2026 for all Uploads, I
wanted the Actual Dates as per the CSV not the Upload date — It creates a
Complaint issue."*

Right, and worse than a display fault. The register's Date column read
`created_at` — when the ROW was written — so 24,749 feedbacks collected over two
years all read as one afternoon. **On a complaint record the date a customer
complained is part of the record.**

**The values were never lost**, which is what made this fixable without asking
for the file again. The importer is `extraInto: 'answers'`, which keeps every
unmapped column under its ORIGINAL SPREADSHEET HEADING. Measured against the
user's own `v2Feedback - Merge.csv` (24,749 rows):

| heading | filled | example |
| --- | --- | --- |
| `Visit Entry Date` | 24,748 | `02-Jan-2025 11:18:59` |
| `Visit Date & Time` | 24,748 | `01 January 2025` |

`0190_feedback_dates_and_origin.sql` adds `entry_at` and backfills it out of
`answers`. **Proved against the real file, not a fixture**: 400 rows loaded in
the shape the importer leaves them, all reading `2026-09-14` before and **48
distinct dates from Jan-2025 to Jul-2026** after.

`entry_at` **defaults to `now()`**, so the column means "when this feedback was
taken" on every row — a column correct only for imported rows would move the
problem. The parse is **guarded on the shape**, because
`to_timestamp('rubbish','DD-Mon-YYYY')` RAISES rather than returning null: one
bad cell would otherwise fail all 24,749.

`imported_from` answers the other half of the same question — *"Can I segregate
the Uploaded ones and the Ones that were entered in the new CRM?"* — in the shape
the Field Failure Register already uses (0179).

### And the answer to the DCCR question

*"For DCCR — Can I add Old Data? Like FFR?"* — **yes, already.** `DCCR Register`
is an existing Bulk Upload, keyed on `ucn`, requiring Field Calls first. Review
Status, Any Potential Effect, Action Taken and the "Review N Completed" flags are
DERIVED and ignored from the file; everything else belonging to the call and its
visits is ignored too, because it belongs to the call.

### The Pareto drills, in the reader's order

*"I need 3 Levels of Drill Down, Product, Complaint Grouping, Root Cause Key
Word"* and then *"The 2nd and the 3rd are interchangeable or can be skipped"*.

A chain, not a "rank by" selector — "which machines fail most" and "which root
causes are behind them" are not two charts you switch between; the second is
asked OF the first. But after the machine, the order is the investigation's, so
the chart OFFERS the levels still open rather than marching through three.

**The level is derived from the filters**, never held separately: drilling sets
the same `picked` the rest of the page reads, so picking a machine on the bar
chart above advances this chart too. Two sources of truth for "where am I" is how
a drill-down shows one thing and claims another.

### To run on the live project

[`data_integrity.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/data_integrity.sql)
— `_status.sql` row 145 answers NO until it is in. It backfills; nothing needs
re-uploading.

## 2026-09-14 — Two pages on open, and a refusal that reads as one

"paging - Keep it at 1000 then" … "But perform that action once more
automatically". The REQUEST stays at 1,000 — what PostgREST will actually return
— and the register makes **two** of them before showing anything, so it opens on
2,000 rows. `more` and the `+` are judged against the whole OPENING request, not
one page; otherwise a full 2,000-row open would read as the end of the register.

### A refusal that read as a fault

Found by checking my own work rather than reported: `objective_evidence` gates
the FFR count (0142) on `ffr.view`, and **seven of the twelve roles that can open
the Objective page do not hold it** — commercial, engineer, spare_coordinator,
stores_incharge, tally_coordinator, technical_support, zoho_migration. Measured
against `app_roles`, not guessed. Every one of them would have got a raw
`RBAC: ...` string in a red banner, which reads as the page being broken rather
than as the register being closed to them.

The gate itself is right and stays: the evidence for a count of Field Failure
Reports IS the reports, and somebody who may not open that register should not
read it through a side door. What was wrong was the wording. The figure stays
visible; the refusal now says so and names the right to ask for, in the same
shape as the access banner on the Field Failure Register itself.

## 2026-09-14 — Blank date boxes, multi-select filters, and a bigger first page

### The dates were never in the form

Reported: *"Why the Dates are not loaded in the Form even though the information
is very much available?"* — the Contract Register listed START 06-Sep-2025 and
END 05-Sep-2031 while the drawer showed three blank `dd --- yyyy` boxes.

`fromDb` ran every date field through **`fmtLongDate`**, which produces
`06-Sep-2025`. **`<input type="date">` accepts ONLY `yyyy-MM-dd`** and renders
anything else as EMPTY — no console error, nothing on the page. The distinction
was already understood in that file (an existing comment reads *"that is a
VALUE, not a rendering"*) and applied the wrong way round.

**Nothing was lost.** The draft holds the raw database value until somebody
edits a field, so a save preserved the dates; they simply could not be seen or
changed. `localIsoDate` rather than a slice, because `entry_at` is a
TIMESTAMPTZ and slicing gives the UTC day — already tomorrow in IST after 18:30.

### Multi-select on the Field Failure Register, and a Product filter

Asked for: *"In the Filter in FFR , I need Multi Select Option. Add Product
Filter as a Default Filter along with the Year Filter."*

`MultiPick` is new — a **sibling of PickList, not a mode inside it**. PickList is
on every form here and its contract is "one value, and choosing closes the
list"; multi-select inverts both halves. Threading that through would put an
`if (multi)` in each of its branches, on the control the Daily Call Review's
Auto Save depends on.

**Empty means ALL**, which is what lets the Product filter sit beside the Year
one costing nothing. The products offered are the ones the CHOSEN YEARS hold: a
filter listing a model with nothing behind it offers a click that can only empty
the screen.

### Contract / Warranty open on a full page

Asked for: *"Make the Default Load Row to Max And Load More should load 2x"*.
200/500 → 1000/1000, and each Load more doubles. **The doubling is in the NUMBER
OF REQUESTS, not the size of one**: PostgREST caps a response (`db-max-rows`), so
asking for 4,000 returns 1,000 and the page would conclude there was nothing
more — a register that looks complete and is not.

### Two guards that matched their own comments

Twice in one session an assertion searched a whole module for a string and
matched the COMMENT explaining what had been wrong — once for `fmtLongDate`,
once for `<select>`. Both would have been "fixed" by rewording a comment, which
is how a guard quietly stops guarding. `check:ui` now has `code(src)`, which
strips comments: search it when the question is what a module DOES, the raw
source when the question is what it SAYS.

## 2026-09-14 — A key without an UPDATE policy, and the FFR count automated

### The feedback upload stopped at row 24,093

Reported the moment the key from 0186/0188 went live:

> Your role does not have permission for this action. (row ~24093)
> (24092 written before it stopped.)

24,092 rows inserted, then one **collided**, the upsert became an UPDATE, and
`public.feedback` had **no UPDATE policy at all** — 0001 gave it a read and an
insert, 0008 narrowed those two to rights, and nothing ever updated a feedback
row until the key existed.

**GIVING A TABLE A CONFLICT TARGET CHANGES WHICH POLICY THE IMPORTER NEEDS**, and
the gap shows only at the one moment an upsert earns its keep: the re-load.
`0189_feedback_update_policy.sql` copies `fb_write`'s audience **verbatim** —
whoever may file a feedback may correct one, which is the rule 0186 wrote down.
Reproduced before fixing: without it the test raises *"new row violates
row-level security policy (USING expression)"*, which is what the app surfaces
as the reported message.

`check:upserts` asked only whether PostgREST could INFER a conflict target. It
now also asks whether the caller may WRITE the row it infers — and that found
**`stock_transfers` carrying the same hole**, unreported because nobody has
re-loaded that register yet (`0123_stock_transfer_update_policy.sql`). The
quantities are untouched: they live in `stock_transfer_lines`, which declares no
conflict target at all.

### Objective 1 calculates itself

Asked for: "Automate / Calculate -> No.of Field failures registered in FFR ;
Logic = No of FFRs registered for the Month". It was the last SERVICE objective
still typed. `0142_objective_ffr_count.sql` adds `ffr_count_monthly`.

- **It counts REPORTS, not rows.** 0181 made the register one row per MACHINE
  because one report covers several — measured at eight FFR numbers over twelve
  machines — so counting rows would report twelve failures where four reports
  exist. The evidence lists every machine row and says why it out-numbers the
  figure.
- **Zero is an answer.** The first COUNT on a page of RATES: a rate over no
  machines is undefined and stays blank, a count over nothing is nought, and on
  a "To Monitor" objective that distinction IS the finding.
- **The evidence workbook was built around `numerator ÷ denominator`.** A
  Calculation sheet reading "12 ÷ 12 = 1" would be arithmetic nobody performed,
  on a page whose whole purpose is that a figure can be checked. A count now
  gets its own layout, and Sheet 1 gets FFR headings rather than the call
  register's.
- The first draft carried a fallback to `created_at` for a missing FFR date,
  and a note in the evidence pack explaining it. **Both were dead**: 0165
  declares `ffr_date date not null default …`. The test found it by inserting a
  null, and keeps that insert so the question returns if the column is ever
  relaxed. A note describing a rule that can never fire is worse than no note
  in a record somebody signs.

### The Field Failure Register has a year

Asked for: "Add Year Filter - Default it to the Current Year." By the **FFR
date** — the same date 0142 counts by, so the register and the objective cannot
report different years for one report. It narrows the register, the table **and
Insights** together: a year is a reporting period, unlike the search box and the
status chips, which still stop at the register. The current year is always
offered even when empty, and an empty year says so rather than looking like an
empty register.

### To run on the live project

[`data_integrity.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/data_integrity.sql) ·
[`stock_transfer.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/stock_transfer.sql) ·
[`objective.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/objective.sql)

`_status.sql` rows 142, 143 and 144 answer NO until each is in.

## 2026-09-14 — The feedback key could not be repaired by re-running the file

Reported from use, AFTER running the corrected bundle:

> Customer Feedback - there is no unique or exclusion constraint matching the
> ON CONFLICT specification (row ~1) ... (0 written before it stopped.)

**The bundle ran. It reported success. It changed nothing.** `IF NOT EXISTS`
guards a NAME, never a DEFINITION:

- `add column if not exists ucn_key ... generated always as (<new expr>)` is a
  no-op when the column exists — the generation expression is never compared.
- `create unique index if not exists feedback_ucn_key_uniq ...` is a no-op when
  an index of that name exists — its definition is never compared.

0186 changed BOTH while reusing BOTH names, so a project that had run its first
version keeps the PARTIAL index for ever, and PostgREST cannot infer a partial
index as an ON CONFLICT target. Every later run of the corrected file confirms
it is already correct.

**Proved rather than reasoned**: a throwaway Postgres built with every migration
except 0186, the FIRST version of 0186 applied by hand, then the current
`data_integrity.sql` run over it — no error, and the index was still
`... (ucn_key) WHERE (ucn_key <> ''::text)`.

`0188_feedback_key_repair.sql` inspects and replaces: it finds the index by
SHAPE rather than by name (PostgREST does not read names either), rebuilds the
generated column when its expression is superseded, de-duplicates, and creates a
total index. Safe on all three states — never applied, applied at the first
version, applied at the corrected version — and
`supabase/tests/feedback_key_repair_test.sql` walks all three.

`_status.sql` row 139 now asks by shape too. Its first version looked for the
index BY NAME and checked its definition for a `WHERE` — right about the
predicate, blind to an index under any other name.

⚠️ The lesson is in `CLAUDE.md` under Gotchas, because this will recur: 0185
escaped it only by naming its new index differently.

### To run on the live project

[`data_integrity.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/data_integrity.sql)
— [read it here](https://github.com/neurolooom-eng/RITHI_CRM/blob/main/supabase/apply/data_integrity.sql).
Once more, and it is safe however many times.

## 2026-09-14 — "About to expire" is thirty days, and the number lives in one place

The formulas file the comparison was waiting on arrived, and it settles the one
thing `0036_sales_contracts.sql` had to guess. All four sheets carrying a Status
column state the same rule:

    IF(end>=Today(), IF(end<=(Today()+30),"ABOUT TO EXPIRE","ACTIVE"), "INACTIVE")

— `SaleEntry M2`, `WarrantySaleDetails V2`, `ContractEntry L2`,
`ContractDetails W2`. **Thirty days, not sixty.**

0036 chose 60 and said so in the file rather than pretending: the PDF describes
these columns only as "a spreadsheet formula … emits values including ABOUT TO
EXPIRE, ACTIVE, INACTIVE" — it names the outputs and withholds the rule. This is
the guess being replaced by the fact, not a fix to a bug.

**Not cosmetic.** The registers filter and count by this value, so a contract
with 45 days to run was listed as about to expire and chased a month early, and
the tile's count was a month too big.

- `0187_cover_expiry_30_days.sql` — redefines `cover_state()`. The three views
  call it by name, so nothing is rebuilt and no `security_invoker` is touched.
- **The number was written down THREE times** — `cover_state()`, `coverStatus()`
  in `coverspec.ts` (which nothing used), and a fourth hand-rolled `stateOf` in
  `CoverRegister.tsx`. So the **Entries** tab and the **Machines** tab could have
  labelled one contract two ways. The screen calls `coverStatus` now, and
  `check:ui` reads the number back out of the BUNDLE and fails if the SQL and the
  TypeScript disagree.
- One deviation KEPT, and it is the sheet that is wrong: in Sheets a blank cell
  compared with `>=Today()` is TRUE, so the sheet calls a machine with no end
  date ACTIVE. That is a comparison artefact. A missing date is `NOT COVERED`.

Three more things the file made concrete:

- **`Monthly` was missing from Payment Schedule.** ContractEntry col 5 lists four
  values and three had been transcribed; the field takes no free-text fallback,
  so a monthly contract could not be keyed at all.
- **Add Call fills itself** — `=if(LEN(U)<2,"WI-","RWI-")` where `U` is
  *Already Sold TO*. Keyed on that field changing, so a hand-typed value is never
  overwritten.
- **Priority is confirmed as sheet row-ordering** — a constant per sheet (1, 2,
  3, 1), blanked on an empty row. It sorts the four sheets against each other
  when merged and says nothing about the record. That is what 0.9.243 removed.

### `check:status` was passing on a report that did not run

Found by accident while adding a row: the skipped-row count fell from 1 to 0
and nothing failed, because `_status.sql` had a **syntax error**. `psql -f`
exits 0 on a failed statement unless told otherwise, so the report came back
empty, the "NO" filter matched nothing, and the script printed *every row reads
yes*. **A checker that passes on no output is the worst kind** — loudest exactly
when it knows least. It now runs with `ON_ERROR_STOP`, keeps stderr, and counts
the rows the report produced against the checks the file declares.

### A stale apply bundle had been handed out

Noticed while regenerating: `0186_feedback_key.sql` was committed (f3fb9c4) with
the corrected, NON-partial unique index, and `supabase/apply/data_integrity.sql`
was **not regenerated in that commit**. So the raw link given for that bundle
carried `create unique index … where ucn_key <> ''` — a partial index, which
`check:upserts` exists to refuse because PostgREST cannot infer it as an upsert
target. **Re-take the link; the bundle is correct now.**

No check could see it: `check:replay` and `check:status` both build their
database from the bundles, so a bundle and an `all.sql` stale in the same way
agree with each other perfectly. `npm run check:generated` (new) regenerates into
a temporary directory and fails on any difference — mutation-tested by putting
the stale file back.

### To run on the live project

[`sales_contracts.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/sales_contracts.sql)
— [read it here](https://github.com/neurolooom-eng/RITHI_CRM/blob/main/supabase/apply/sales_contracts.sql).
`_status.sql` row 139 answers NO while the sixty-day band is still live, and it
asks the function rather than reading it, because that is the only way to tell 30
from 60 on a project that has run one bundle and not the other.

And [`data_integrity.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/data_integrity.sql)
— [read it here](https://github.com/neurolooom-eng/RITHI_CRM/blob/main/supabase/apply/data_integrity.sql)
— which was already pending for 0186 (the Customer Feedback key) and whose
earlier link carried the stale partial index described above.

## 2026-09-14 — Priority off four registers

Asked for: "I don't need the column Priority in warranty sale details, Contract
Details, additional entry details, ownership transfer details." It landed two
different ways.

- **Warranty Sale Details / Contract Details** — `priority` was a form field AND
  a database column. The field is removed.
- **Additional Entry Details / Ownership Transfer** — there is **no column and no
  field**. Priority arrived from the AppSheet export and `extraInto` kept it on
  the row, so it was carried, exported and listed on every load. Dropped now.
- `UploadDef.ignore` added for that: headers matched through the shared matcher
  and dropped, reported as **ignored** rather than unrecognised — "we discarded
  this on purpose" and "nobody has named this yet" are different messages to
  somebody deciding what to name next, and the screen shows them apart.
- **The first version filtered the REPORTING only**, so the screen said "not
  kept" while the value was still on every row. check:uploads caught it; the set
  is resolved before shaping now.

**The database columns on `sale_items` and `contract_items` are NOT dropped** —
nothing writes or shows them, and dropping a column is irreversible. Say the word
if they should go. `proposeRenewal` still copies the value on a contract renewal,
which is harmless while the column exists.

## 2026-09-13 — DONE (2026-09-14): Contract / Warranty field-by-field comparison

**The markdown file arrived** (`Appsheet - Forms.xlsx — Formula Reference`) and
the comparison is in `docs/COVER_FIELD_COMPARISON.md`. What it changed is the
section above dated 2026-09-14.

**The ask:** produce the field tables for **Contract Entry**, **Contract
Details**, **Warranty Sale Entry** and **Warranty Sale Details** (the parent and
the child of each), and compare **AppSheet against here** — field by field.

What is already known and should be reused rather than re-derived:

- `docs/APPSHEET_ADMIN_APPDEF.md` holds schemas 3.5–3.8, but **only the column
  definitions** — its own boundary note says the PDF stops before the views,
  format rules and actions. The new file is expected to carry the formulas the
  PDF did not show.
- The ContractDetails comparison was already done once by hand (session
  2026-09-13): 23 of 31 columns map to a field on the machine line, 3 are the
  database's (UID, MC Number, Contract Entry Date), 3 are deliberately not
  carried (`_RowNumber`, `Item Details Long` / `Item Details`, `LINK`), and
  **one is a genuine gap — `Product Details`**, the picker that should feed the
  code / name / serial split. The splitter exists in `coverspec.ts` and is
  tested, but nothing on the screen feeds it.
- Arithmetic already transcribed in `src/lib/coverspec.ts` (v0.9.235) with each
  expression verbatim: years, EOMONTH end date, the two DIFFERENT PM rates,
  18% tax, the split and its rebuild.

**Open decision, STILL unanswered:** whether Contract Details gains a **Product
Details picker** so a machine is chosen from Product Master rather than typed.
The formula file settles what the string IS — `ContractDetails C2 = O2` proves
`Item Details Long` and `Product Details` are the same `CODE|NAME|SERIAL` value —
but not whether this register should pick one instead of typing three fields.
Until it is answered, `deriveItem`'s `product_details` branch stays correct and
unreachable: no field feeds it. It is tested, so it will not rot.

## 2026-09-13 — How to Use RITHI CRM is grouped in a sensible order

Reported: "Its arranged in a Random Order." It was, and the cause was mechanical
— 18 tasks were APPENDED to the existing 15, so *Quality* and *Your account*
each opened twice and the reader met calls, spares, feedback, password, then
quality again.

Reordered into ten contiguous groups, renumbered 1–33: Calls · Spares & stock ·
Quality · Warranty & contract · Workshop · Loading data · Analysis & reports ·
Masters & search · Your account & the app · Admin & the team.

- The reorder is a MOVE, not a rewrite: every section literal is unchanged apart
  from its number and which group it opens.
- **My own check was wrong and hid the fix**: its pattern assumed `n` follows
  `id` immediately, so the ten group-opening tasks did not match and it reported
  a gap the file did not have. It allows `group` between them now.
- Two assertions added: no group heading appears twice (which is exactly the
  fault reported), and every group is named.

## 2026-09-13 — Validation package Rev 2.4

URS-060..064, FRS-072..076, R-39..R-43, FM-30..FM-32, OQ-54..57. Four of the
five are written from **faults found in use**, each established by MEASUREMENT
rather than by reading the schema:

- **URS-060** a record is keyed on what identifies it — a device is its model
  AND its serial. 342 machines and 12 machines would have been lost silently.
- **URS-061** a value that cannot be determined is left empty, not fabricated —
  2,985 rows of 4,327 refused by a manufactured value.
- **URS-062** every loadable register has an inferable natural key. The check
  refused a partial index written during this revision.
- **URS-063** a read-only role holds no write authority; a copied role does not
  track its source. **And such a holding is reported for REVIEW, not as a
  defect** — a status row that reads NO on a deliberate grant sends somebody to
  re-apply configuration that cannot remove it. That row did exactly that, twice.
- **URS-064** no part of a credential can be recovered from a log. Masking is
  insufficient: the client reports the piece it failed on.

Traceability verified programmatically: no FRS points at a missing URS, every new
URS carries a test, no risk points at a missing FRS.

**The credential exposure is NOT closed by Rev 2.4** and is recorded in it as
requiring rotation.

## 2026-09-13 — The Technical Support status row was lying

The user ran `_status.sql` after applying `rbac.sql`. Zoho Migration went green;
**Technical Support still read NO**, and I had told them `rbac.sql` was the fix.
It is not, and cannot be.

- The row tested that the role holds none of 23 write actions, **including
  `review.edit`** — which an administrator ticked deliberately and which **the
  user chose to keep** when they answered "revoke from Zoho only". 0145 MERGES
  and never removes, so no bundle can make that row green.
- **This is the exact fault CLAUDE.md warns about**: a NO when nothing is
  missing, acted on by re-running a bundle already in. It happened twice now.
- Row 111 tests **what the bundle provides** — the role, its module keys,
  `data.view_all`, `admin.view`. Reproduced the live state (review.edit ticked)
  on a throwaway: `check:status` now reads all yes.
- The read-only property moved to `_zoho_diag.sql`, widened to **both** roles and
  to all 23 actions. It reports a grant as a **question** — "somebody granted
  this; is that still what you want?" — never as a bundle to run.
- Clause A relabelled from **drift** to **difference (expected)**: under
  seed-once cloning the two roles are meant to diverge.

## 2026-09-13 — The in-app How to Use guide covers every area

Asked for as "Update 'How to Use RITHI CRM' under Knowledgebase with all
Instructions for all Modules — First Read what is there, Analyse the Delta and
then Update." **The page already existed** (`src/modules/HowToUse.tsx`, its own
topic under Knowledge Base) with 15 tasks, all calls and spares.

- **The delta:** nothing at all for the Daily Call Review, Call Review, Field
  Failure Register, Insights, cover entries, ownership, hand stock, MRN,
  transfers, Stock Out, Bulk Uploads, the FFR years, Indoor Service, Objective,
  the three exports, masters, search, signature, Tracker or access. **18 added**,
  numbered 16–33.
- Grouping added to the jump strip and the sections — a task carries the heading
  it opens, so the array order is still the page order and nothing was re-nested.
- **check:ui now guards it**: every "Open …" button must name a real screen, the
  18 new tasks must stay, and the numbers must run 1..n with no gap (they are how
  somebody is sent to one).
- **That guard immediately found a real error of mine**: I had written that
  *My Signature* is under Settings. It is on **Profile**. Wrong in the guide, in
  `docs/HOW_TO_USE.md` and in the published artifact — all three corrected.
  It also showed the first version of the check was too strict: `/profile` is a
  real route deliberately outside `MODULES`, because it is personal and no
  permission gates it. The check reads routes as well as modules now.

**Still to do:** update the validation package.

## 2026-09-13 — Two exports "unable to load", both the importer's fault

Reported as *"Nothing loadable — every row is missing serial number / ucn. Is
this the right register for this file?"* It was the right register both times.

- **Additional Entry Details** — the def looked for `serial number`; the export
  says **`Product Serial Number`**. Also `Warranty Start Date` vs
  `warranty start`. 2,262 of 2,263 rows load now (the one held back has a blank
  serial).
- **`0185`** — and fixing that exposed the real fault. **MEASURED:** 2,263 rows,
  1,920 distinct serials, **298 serials belonging to more than one product** —
  serial 15 is an ANAVENT and an ORION, 239 is four machines. Keyed on
  `serial_key` alone, 640 rows would collapse to 298 and **342 machines vanish**
  on a load reporting success. `src/lib/machine.ts` already states the rule and
  records the incident behind it; 0077 contradicted it. Now `machine_key`.
- That table also gained `extra` — it was the only importer **dropping**
  unrecognised columns, and this export has 24 of which it named nine.
- **Customer Feedback** — looked for `ucn`, export says **`UC Number`**; also
  missed `Visiting Service Engineer`, `Product Serial Number`,
  `Complaint Reported` and `Visit Date & Time`. 24,748 of 24,749 rows load now.
- **`0186`** — the user: *"Feedback has KEY - Simply use it."* Correct: 24,748
  distinct UC Numbers, zero repeats. Keyed on `ucn_key`.
  **The first version used a PARTIAL index and `check:upserts` refused it** —
  a partial index is no more inferable than an expression one. A blank UCN now
  keys off its own row id, so the index is total and no record is deleted.
  Filed in `data_integrity`, not `base`: base creates the table but refuses to
  run once RBAC is in.

**Pending: the user to run `sales_contracts.sql` (0185) and
`data_integrity.sql` (0186), then re-upload both files.**

## 2026-09-13 — Cover field labels reconciled; the AppSheet rebuild is done

Diffed programmatically against schemas 3.6/3.7, not by eye. **21 of 21 of the
plain fields already matched**; ten differed by wording and were changed.

- **My diff tool was wrong before the code was.** Its regex was `[a-z_]+`, so it
  reported `tel1`/`tel2` MISSING when both are on the form. Verified before
  changing anything — the lesson being that a tool built to find faults can be
  the fault.
- Surgical per register: `Period (Years)` appears in BOTH, so a global rename
  would have mislabelled one. check:ui asserts neither borrows the other's word.
- **Not matched, deliberately:** the spec's SHOUTING (`INVOICE NO`, `PM VISITS`,
  `COUNTRY`). Those are COLUMN names, and the document's own boundary note says
  the AppSheet **Label** property is recorded only "where it materially
  identifies a field" — so what the old screen displayed is not in the document.
  Copying the column's case would assert something it does not support, and make
  the form shout in four places and nowhere else.
- Also kept: `Sale Entry Date` over `Timestamp` (a Forms artefact; the spec's own
  detail table calls it Sale Entry Date), and `(as keyed)` on the two status
  fields, since the register computes a status of its own.

**FIELD ORDER WAS NOT CHANGED, and that is a finding rather than an omission:**
the schema order is the SPREADSHEET's column order, not a layout. The spec shows
no views at all. Reordering the form to a sheet's column order would be matching
the wrong artefact; the section grouping is a layout decision the document
cannot contradict.

The AppSheet rebuild is complete: formulas (0.9.235), the save-breaking phantom
columns (0.9.236), numbering (0.9.237), labels (0.9.238).

## 2026-09-13 — The cover entry offers its own number

- `nextCoverNumber(kind)` + "+ New entry" opens with the next SA/MC already in
  it. **Ordered by `id`, not by the number**: `SA999` sorts after `SA1200` as
  text, so asking the database for the largest number answers with the wrong one
  the moment the series passes 999.
- **Offered, not reserved**, and editable. A concurrent second entry is refused
  by the unique key on save — the honest failure, since a number handed out and
  abandoned leaves a gap in a series somebody audits.
- A failed lookup does not block the form; the field is simply blank.
- One assertion had to be rewritten: it split the file on `nextCoverNumber` and
  found the IMPORT line, so it passed on text that proved nothing. It reads the
  handler body now. Mutation-tested.

**Remaining on the AppSheet rebuild:** field ORDER and labels against schemas
3.5–3.8. The contract fields are already complete; the warranty line is complete
except `Item Details Long`, which has no column and is derivable — see the
2026-09-13 phantom-column note for why it is not written to the row.

## 2026-09-13 — The cover derivations put two phantom columns on the row

Found while continuing the cover rebuild, **not reported** — and it was a fault
0.9.235 had already shipped.

- `deriveItem` set `item_detail_long` on a warranty machine line. There is no
  such column: `item_detail` exists on `parts` alone. `saveItem` sends the row
  unfiltered, and PostgREST refuses the WHOLE write for one unknown column — so
  editing a product code, name or serial lost the entire save.
- The guard then caught a **second** instance: rate → tax → total was not gated
  by register, and `sale_items` has no rate or tax columns. The spec puts them
  on ContractDetails (cols 20-22) and nowhere on WarrantySaleDetails.
- **This is the Field Failure Register's `live_*` fault, one module over, in the
  same session.** So the fix is the class: `saveHeader`/`saveItem` now send only
  the columns the register DECLARES, built from the field definitions, so a
  column added to a form is writable by that fact alone. `saveHeader`'s old
  blacklist (drop `item_count`, `items`) is gone — it worked until a third
  arrived.
- `check:ui` now runs every derivation over every declared field and fails on
  any key that is not a real column. Mutation-tested: reinstating
  `item_detail_long` fails it with all three driving fields named.
- `check:ui` gained `--define:import.meta.env={}` so a check may import a module
  that sits beside the Supabase client without needing a database.

## 2026-09-13 — The cover registers get the AppSheet arithmetic

Asked for as "build the Warranty Sale Entry, Warranty Register, Contract Entry,
Contract Register" from `Admin_AppDef_Source_Grounded_Review.md`. **All four
already existed** (`CoverRegister.tsx`, mounted in App.tsx) with entries,
machines, "+ New entry", header→machine inheritance and contract renewal. The
user's decision when told: rebuild to match AppSheet exactly.

- **The spec has NO layouts.** Its own boundary note says the PDF stops after
  `Product Master_Schema` col 4 — no views, format rules, actions or slices. So
  "exactly" can only mean the FIELDS and the FORMULAS, which it does give. No
  layout was invented and called a match.
- **`src/lib/coverspec.ts`** transcribes the arithmetic with each expression
  kept verbatim beside its implementation: Years = Months/12, the EOMONTH end
  date, warranty PM = (months/12)×3, contract PM = months/6 (**different
  rates**), 18% tax, Total After Tax, the CODE|NAME|SERIAL split and its
  rebuild, and the status bands.
- **The end date already matched.** `addPeriod` implements the spec's EOMONTH
  rule exactly — proved over 80 combinations including every month-end, zero
  differences — so it is reused rather than re-spelled.
- **Derivation is keyed on the field EDITED**, not run over the row: editing the
  end date derives nothing, so a part-month contract still works, and a machine
  line's inherited fields are not all pinned the first time one is touched.
- **The numbering deviates deliberately.** The spec uses `_RowNumber`, a
  spreadsheet row — unstable, and not a property a database row has. The series
  continues from the highest issued, with the spec's offsets kept as the FLOOR.
- The spec is now `docs/APPSHEET_ADMIN_APPDEF.md`, and check:ui asserts each
  formula against the expression the document prints.

**Still to do on this ask:** reconcile field ORDER and labels against the
schemas (3.5–3.8), add the missing line fields (`replacement_unit`,
`replacement_unit_sl`, `item_detail_long`, `added_by`) to the forms, and wire
`nextInSeries` into "+ New entry" so the number is offered rather than typed.

## 2026-09-13 — The migrate pipeline leaked a password fragment AGAIN

`SUPABASE_DB_URL` **is set** on the repository, so `db-migrate.yml` runs on
every push touching `supabase/migrations/` — and fails, because the password
contains an unencoded `@`. Run 56 (2026-09-13 15:02) printed:

```
could not translate host name "110@aws-0-ap-south-1.pooler.supabase.com"
```

That is the TAIL of the password, in a public log. **This is the second time.**

- **Why the scrubber missed it.** Node's `URL` splits userinfo at the LAST `@`
  (password `pa%40ss110`, host correct); **libpq splits at the FIRST**, so its
  host is `ss110@…` — a SUFFIX of the password, which matches neither the
  password nor the URL, so no exact-string mask could catch it. GitHub's own
  masking showed `SUPABASE_DB_URL` as `***` and looked like it had covered it.
- **Fixed by prevention:** `apply-migrations.mjs` now refuses before psql runs
  when the URL has more than one `@`, naming the fix (`%40`) and printing no
  part of the credential. Verified with the real shape.
- **Defence in depth:** every tail of the password (3+ chars) is now masked, so
  the same shape from any other tool is caught.

**USER ACTION, both still outstanding:**
1. **Rotate the database password** — a fragment is public, twice.
2. Percent-encode it in the secret (`@` → `%40`), then the pipeline runs green.
3. Optionally delete the failed `Apply database migrations` runs.

## 2026-09-13 — The real Ownership Transfer export, and Insights you can question

- **`0183`** — the first real file held back **2,985 of 4,327 rows**, all
  "already with X — not a transfer". The AppSheet export's own `Party Name
  (FROM)` resolves to the machine's CURRENT owner, so every already-applied
  hand-over names its own destination. 0182 had established the principle for
  the value this system fills in; applying it to the filled value but not the
  supplied one was a distinction the data does not support. A supplied `from`
  equal to `to` is now treated as not supplied. The constraint stays, and is
  now unreachable through the trigger — the invariant is still declared.
- **`0184`** — the register had **no natural key**, so a second run added rows
  rather than correcting them, and the screen said so. The key is the **OT
  number AND the machine** — one hand-over document can cover several machines,
  the same shape 0181 found in the Field Failure Register. The OT number is now
  required, per the rule the FFR importer already uses.
- **FFR Insights cross-filters.** Click any mark and every figure re-answers for
  it; each chart counts the rows left by every OTHER choice, so the chart you
  clicked still shows its alternatives. Chips name what is applied.
- **`check:uploads` added to the CLAUDE.md verification list.** It was not in it
  and had drifted: two assertions had been failing on `main` unnoticed — one
  looking for `Purchase Cost` in `extra` after 0148 gave `parts` a real column,
  one counting 30 registers after a 31st was added.
- **Pending: the user to run `sales_contracts.sql`** (0183 + 0184).
- **Next: Warranty Sale Entry / Register and Contract Entry / Register** from
  `Admin_AppDef_Source_Grounded_Review.md`. Checked: every column the spec names
  already exists in `sale_entries`/`sale_items` and
  `contract_entries`/`contract_items`, so it is a UI build with no schema work.

## 2026-09-13 — Ownership Transfer stopped on its first row

- **`0182`** — reported as `violates check constraint
  "ownership_transfer_parties_differ" (row ~1) (0 written)`. Reproduced both
  ways before fixing. 0072 fills a blank `from_party` from the machine master;
  once the master has caught up that returns the **destination**, so from = to
  and the constraint refuses the row — and one row stopped the whole file. Not
  a corner case: a Product Master naming each machine's current owner hits it
  on the last hop of every machine. The fill is now conditional and
  `from_party` is left **empty** where the master cannot answer. The constraint
  is deliberately untouched — the invariant was right, the manufactured value
  was not.
- **`reject` on the Ownership Transfer upload** — a row whose own file names the
  same party twice is skipped with a reason rather than taking the batch down.
- **Pending: the user to run `sales_contracts.sql`.**

## 2026-09-13 — The FFR importer met the real files, and three bugs fell out

Reported as "the Bulk upload is not working", with all ten years attached. It
was not the files.

- **`parseCSV` read row 1 as the header row.** Every year of this register has
  three rows above the headings (company, title, PAGE NO), so nothing matched,
  the required column was "missing" and every row was skipped. `pickHeaderRow`
  finds it from the importer's own aliases. Default unchanged where no aliases
  are passed, so no other importer moves.
- **The 2020 tab is TAB-separated** and read through a comma parser as one
  column. `pickDelimiter` decides from the file, not the extension.
- **A repeated heading took the LAST column.** 2021–2025 each carry `FFR Date`
  twice — the date, and a month label ("Feb 2021") — so every FFR date in five
  years would have parsed from the month alone and lost its day, silently.
  First occurrence wins now, matching headers.ts.
- **`0181` — one report can cover several machines.** Eight FFR numbers in
  2016–2019 appear on several rows (16/18 covers serials 252–255). Keyed on the
  number alone, 20 rows became 8: twelve machines overwritten with no error.
  The key is now (ffr_no, product_serial).
- **`isMonthFirst` in dates.ts** — 2016 is American-style. Decided per COLUMN
  from evidence (a value above 12 in the month position) and shown on the
  upload screen; day-first remains the rule and every other year is untouched.
- Result: 655 reports across 2016–2025, with only formula-residue rows skipped.
- **Pending: the user to run `daily_review.sql` (0181) and load the years.**

## 2026-09-13 — Zoho Migration held a write action, and cloning was the cause

- **`0180_zoho_readonly.sql` — `review.edit` revoked from `zoho_migration`.**
  `_status.sql` reported the role NO on the live project and `_zoho_diag.sql`
  named the clause: not drift, a WRITE ACTION. Established on a database rather
  than argued — `review.edit` grants ALL commands on `call_reviews`, a user on
  the role answered Review 2 with Risk to Patient = Yes, the 0167 trigger fired
  and **FFR - 001/26 was raised in their name**, a record 0166 means can never
  be deleted. **Technical Support KEEPS it** — the user's decision, asked before
  anything was changed: the grant there was intended, and revoking a permission
  an administrator chose is not a tidy-up.
- **`0155` — a clone SEEDS a role once; it is not a standing mirror.** The
  user's rule (2026-09-13), and it applies to all cloning here. 0155 used to
  merge Technical Support's whole row into Zoho Migration on every run of
  `rbac.sql`, so a tick on one role silently widened the other — which is
  exactly how `review.edit` crossed over. Two roles kept identical forever are
  one role with two names; the point of a separate role is that it CAN diverge.
  Once it exists, 0155 leaves it alone. **`0155` is the only role clone in the
  migrations** — 0035 and 0040 clone tables, not roles.
- **`_status.sql` row 117 no longer tests that the two roles match.** Under the
  rule above, divergence is the expected state, not drift. It tests the property
  that defines the role: it holds none of the actions a write policy names.
- Both halves were needed: a revoke alone would have been undone by the next
  `rbac.sql` run, and the seed-once fix alone would have left the key on the
  live row. Mutation-tested — restoring the old merge makes a newly-ticked
  `masters.edit` cross over again, and the suite catches it.

## 2026-09-13 — `_status.sql` gains the row for 0179, and a Zoho diagnostic

- **`_status.sql` row 135, "a row loaded from a sheet says so"** — 0179 shipped
  the `imported_from` column and NOTHING in `_status.sql` tested it. The user's
  status output came back with every FFR row green and no way to tell whether
  the column the importer needs is actually there; the convention (add a row
  when a bundle gains a checkable object) had been missed. The row tests the
  column, the exception in `ffr_stamp()`, the column reaching the register view,
  and `security_invoker` still on that view.
- **`supabase/apply/_zoho_diag.sql`** — read-only. The Zoho Migration row read
  NO on the live project after `rbac.sql` was run, and it could NOT be
  reproduced here: a fresh apply, and a replay of `rbac.sql` onto a complete
  database, both read yes. So the divergence is in LIVE DATA, not the SQL, and
  the status row alone cannot say which of its two clauses failed — drift (the
  clone fell behind) and not-read-only (the role holds a write action) mean
  opposite things and only one of them matters. The diagnostic names the exact
  keys. Both clauses were mutation-tested. **Pending: the user's output from it,
  then the actual fix.**

## 📌 OPEN ITEMS — everything waiting, in one place

This file is 2,000+ lines and its open items were scattered across four
sections. They are indexed here so nothing waits unseen; each links to the entry
that explains it.

### The register, back to 2016 — 2026-09-13 (v0.9.230, SQL to run)

*"I want Provision to upload FFR Data from 2016 -- I think every year it has a
Different Format -- But it needs to be able to merge all into 1 Table."*

**BUILT NOT TO NEED THE FORMATS IN ADVANCE**, which is the only honest way to
answer it — the 2016–2025 tabs have not been seen. Three things carry it: many
accepted headings per column through the shared matcher; `extraInto: 'extra'`,
so an unrecognised column is KEPT and listed on screen rather than dropped; and
`conflict: 'ffr_no'`, so a corrected year re-loads over itself and the years go
in any order.

Two properties are in the DATABASE (0179) rather than the importer:

* `imported_from` marks every loaded row, so migrated years stay
  distinguishable and a figure over the register can report the split
  (**URS-037**) — the Insights tab now does.
* `ffr_stamp` leaves `raised_by` NULL on a loaded row. The sheet's "Raised by"
  is a NAME with no account behind it; stamping the uploader would say a 2016
  report was raised by somebody who never saw it.

⚠️ **check:replay caught a real one:** `field_failure_register` selects `f.*`, so
the new column arrives in the MIDDLE of its output and `create or replace view`
can only append — a replay failed with *"cannot change name of view column"*.
The view is dropped and rebuilt in 0179, with `security_invoker` re-asserted.
The migration applied fine in order; only the replay exposed it.

**NEXT, and it needs the user:** load one old year and send the "kept on the
row" list. Those are the headings worth naming as real columns; until then they
are on the row and nothing is lost.

**To run:** `daily_review.sql`.

### _status.sql lied about two rows — 2026-09-13 (v0.9.229, shipped, no SQL)

The user ran everything and `_status.sql` still reported **four** NOs. Two were
real (Technical Support and Zoho Migration — `rbac.sql`). **Two were my own
faulty checks.**

Proved rather than argued: `_status.sql` run against a database built from
EVERY migration — where nothing *can* be missing — still reported them NO.

* **the register, its number and its retention** asked for
  `next_ffr_no()` — the ZERO-ARGUMENT signature that **0169 dropped on
  purpose**, because a defaulted argument beside it left the call site
  ambiguous.
* **the REVIEW raises it** asked for `review2_at` inside `ffr_from_review` —
  but 0169 rewrote that as a thin wrapper so the trigger and the catch-up share
  one definition, and the date rule moved into `raise_ffr()`.

Both go on asserting a fact about a definition a later migration replaced. The
same class the project already knows (`check:replay`, the guarded mirrors) — in
the one file whose whole job is saying what is missing.

⚠️ **A row that answers NO when nothing is missing is worse than no row**, because
it is ACTED ON: it sent the user to re-run bundles already applied, and it
teaches that a NO here may mean nothing.

**`npm run check:status`** now runs `_status.sql` against a fully-applied
database and fails on any NO, with a named exemption list (pg_cron only, with
its reason). Added to the SQL verification loop in CLAUDE.md. It catches the
original fault — verified by reintroducing it.

### Two more rows off the visit — 2026-09-12 (v0.9.228, shipped, no SQL)

**Visit Date & Time** and **Complaint Date**, highlighted on screen. Both for
the same reason as the first eight: the value is already there.

* the visit's own HEADING carries the date, two lines above — and it comes from
  the `visit_at` column rather than from this answer, so it stands whether or
  not the form was filled in;
* Complaint Date is when the CALL was raised: one fact about the call, repeated
  identically on every visit of it and printed on the report.

Both spellings of the first are listed (`visitdatetime`, `visitdateandtime`) —
"and" and "&" are equally likely in a label somebody typed.

A visit now reads: date and engineer, then Job Done, the report link, the
software version and the hour meter. Rendered with all three visits from the
screenshot before shipping.

### The part code and name, split once — 2026-09-12 (v0.9.227, shipped, no SQL)

The spares table beside a report printed the catalogue string raw —
*"TOUCH PANEL|Touch panel assembly"*, pipe and all.

**TWO PARSERS ALREADY EXISTED AND DISAGREED.** `dc.ts` had `codeOf`/`descOf`
(no pipe → the whole string); `handstock.ts` has `partDescription` (no pipe →
`''`). Adding a third would have been the four-date-parsers story again, so the
pair moved into `src/lib/parts.ts` as `partCode`/`partName` and `dc.ts`
re-exports them under its old names — a move, not a rewrite, so the Delivery
Challan and the Declaration are untouched.

⚠️ **`partDescription` in handstock.ts is deliberately left alone.** Its
difference is not a bug — hand stock wants "the description, or nothing", a
display column wants "whatever names this part" — but a third caller picking one
at random is how they start to matter. Noted in `parts.ts`.

Verified by rendering all four cases: a normal string, one with a pipe in the
description, one with NO pipe (shows the code rather than a blank cell), and a
voided line, which stays struck through with its original quantity (0049).

### The visit pane, tidied — 2026-09-12 (v0.9.226, shipped, no SQL)

Eight fields highlighted on screen, plus two layout asks.

**HIDDEN**, matched on a NORMALISED key (lower-cased, punctuation stripped)
because these labels are DATA typed into the visit form and one is misspelt in
the live data — *"Recomended Filter Changed?"*. Both spellings are listed, so
correcting it later does not un-hide the field.

* the form's own answers — Add Consumption?, Maintenance Done?, Recomended
  Filter Changed?, Update Visit Work Details? — which steer the form while it is
  filled in and say nothing about the failure;
* what the record already carries — Call Type and Standard Complaint are facts
  about the CALL repeated on every visit and printed on the report; Visit Entry
  Date is when the form was saved, beside the Visit Date that says when the
  engineer was there;
* Complaint Observation, also highlighted.

**DATES** now read DD-MMM-YYYY through the application's own formatter. The
visit heading was `toLocaleDateString('en-GB')` — "01/09/2026", a fifth format
and the ambiguous one. Gated on the KEY, not on whether a value happens to
parse: "V1.2.9" and an hour-meter reading are not dates.

**EDIT AND PRINT** moved to the header row beside the FFR number. The pane
scrolls on its own, so on a long report they could be off-screen entirely.

⚠️ **This is the SHARED pane**, so the Call Review desk gets the same tidy. That
follows from keeping one definition of "what happened on this call" — but it was
not separately asked for, and Complaint Observation is the one I would put back
first if any of it is wanted there.

### The right-hand pane was empty too — 2026-09-12 (v0.9.225, SQL to run)

Two screenshots side by side: an administrator saw the visit work and the
spares; a user on a role granted `ffr.view` saw **"0 visits"** and *"Nothing
booked against this call"* on the same report. The user: *"If certain
Permissions are required, please add it under the Group."*

0176 made READING THE REGISTER a right. It could not, on its own, make the CALL
readable — and the pane loads `reports` and `spare_consumption`, both scoped to
**call visibility**:

* `reports_read` — `calls.view` AND (`can_view_all_calls()` OR the call is
  allotted inside your reporting tree)
* `cons_read` — `can_view_all_calls()` OR yours OR your tree

The same half-granted shape as the register itself, one layer down.

**A FUNCTION, NOT FIVE POLICY EDITS.** Widening it through the policies would
mean touching `reports_read` (owned by `call_requests`), `cons_read` (owned
through the **guarded mirror** in 0121 that `check:bundles` compares word for
word) and the three call tables — five policies across three modules, in the
most fragile corner of this schema. `ffr_call_context()` is one object that says
"elevated on purpose" and carries its own authority test.

**Narrow by construction:** nothing unless the caller may read the register
**and** the UCN actually has a report — so it is not a general call reader. NULL
to anybody else, and the desk falls back to the tables, so nobody loses a visit
their own policies already allow.

⚠️ **Still needs call visibility:** the UCN's status colour and the "call as it
stands now" section come from the `calls` view, not from this function. A role
that should see those wants `data.view_all` ("Across the system") — a much
broader grant, and deliberately not what this change makes.

**To run:** `daily_review.sql`. `_status.sql` row 134 checks it.

### The register was empty, and the role was misnamed — 2026-09-12 (v0.9.224, SQL to run)

Two reports from one screenshot.

**THE ROLE ON SCREEN WAS NOT THE ROLE IN EFFECT.** *"I have assigned a different
Role, but he is on a Different Role."* `roleLabel()` in `auth.tsx` looked the
rbac key up in the static `ROLES` list and, not finding a role added from the
application, **fell through to `ROLE_LABELS[u.role]` — the LEGACY role**. So
somebody on `vptechnical` was shown as "Field Engineer" on their own profile
and in the menu bar.

Their access ran on `vptechnical` the whole time, which is what made it
convincing: the screen named one role and the system enforced another, and
nothing reconciled the two. `roleLabelFor()` is the single labeller now —
built-in name, else the label the database holds for a role added from the app
(loaded with the matrix), else the key humanised. **All three name the role the
person is actually on.**

**THE FFR REGISTER WAS EMPTY FOR SOMEBODY WHO HELD THE PERMISSION.** Reproduced:
`ffr.manage` held, page key held, **0 rows**.

`ffr_read` (0165) tested *neither* permission. Its only clause reaching an
ordinary user was `exists (select 1 from public.calls c where c.ucn = …)`, and
`calls` is `security_invoker` — so the register was scoped to **call
visibility**, and `ffr.manage` granted the right to WRITE a register its holder
could not READ. The "role that sees NOTHING" fault in a new coat, and worse than
a missing permission because everything *looks* granted.

`ffr.view` (0176) now grants the whole register — the user's decision, asked
before changing it: *"I am going to hide the view to everyone; only ppl who need
to view is being given access."* It **widens nothing on apply** (only roles that
already held `ffr.manage`), and the old scope is kept — a report on your own
call is still yours. The screen now says when an empty register is access rather
than emptiness.

⚠️ **`check:bundles` caught a real one:** filing it beside the history policy put
`ffr_read` in `data_integrity` while 0165 creates it in `daily_review` — a
replay of `daily_review.sql` alone would have restored the old policy and
emptied the register again. Split: 0176 last in `daily_review`, 0177 in
`data_integrity`.

**To run:** `daily_review.sql`, then `data_integrity.sql`. `_status.sql` row 133
checks it. **Then tick "Read the whole Field Failure Register"** for the roles
that should see it — the role in the report holds the page but not `ffr.manage`,
so the migration's grant does not reach it.

### Field Failure: Insights + the Register as a desk — 2026-09-12 (v0.9.223, shipped, no SQL)

The user: *"Add an Insights tab and Register [Move the current View to Register].
For the Register, Use the Review Desk -- Left: List of FFRs, Center: Details of
FFR, Right: Details of the Call's Visit Details + Spares Used [Spares Used in a
Tabular Format]."*

**THE RIGHT-HAND PANE IS SHARED, NOT COPIED.** It was lifted out of Call Review
into `src/components/callcontext/CallContext.tsx` and both desks render it. Two
copies of "what happened on this call" would drift, and what they render is a
quality record. `check:ui` now asserts the content where it LIVES *and* that
Call Review has no second copy of it — checking only the old file would have
started passing again the moment somebody inlined one.

**THE FLAT TABLE IS KEPT** as Desk / Table on the Register tab. The ask said to
move the current view there; the desk cannot do what the table does (every
column at once, sorted, filtered, exported), and dropping it would have been a
loss nobody asked for.

**Insights** is computed from the rows already loaded rather than a second set
of queries, over the WHOLE set rather than the filtered one — an aggregate that
moves when somebody types in a search box answers a different question from the
one the page appears to be asking.

Two things found by looking at it rendered: the right pane claimed "0 visits"
while still loading (a count stated before it is known — and on the Call Review
desk "no visit on a solved call" is a *finding*, so a false one matters), and
the template's blank spacer row had collapsed to a sliver on the printed FFR.

### Editing an FFR failed on the view's columns — 2026-09-12 (v0.9.222, shipped, no SQL)

Reported from use: **"Could not find the 'live_any_potential_effect' column of
`field_failure_reports` in the schema cache"**.

**THE REGISTER READS A VIEW AND THE FORM SAVES A TABLE.**
`field_failure_register` carries the record PLUS the live call beside it — 16
`live_*` columns. Clicking a row seeded the edit form with that row, and
`updateFfr` dropped two keys and sent everything else, so PostgREST refused the
whole write and the edit was silently lost. Present since the register was built
(0167); it surfaced now because the weekly review actually edits reports.

Fixed with a **whitelist** (`FFR_WRITABLE` / `ffrWritable` in `src/lib/ffr.ts`),
not a `live_%` strip: a blacklist works until the view gains a column that is
not prefixed, and the failure would again be a save that looks fine until it
isn't. `check:ui` compares the list against the table's own definition in
0165 + 0168, runs the strip over a view-shaped row, **and** asserts both writers
call it — without that last one the fix could be reverted in `supabase.ts` with
every other check still green.

**AND A SECOND BUG IN THE SAME SAVE:** it stamped `raised_by_name = user.email`
on *every* save, so correcting a typo on somebody else's report replaced the
raiser with the editor — and with an address rather than the name the register
shows everywhere else. Raised by is set once now, on the raise; who looked at it
since is the Update log's and the weekly review's job.

⚠️ **Worth an audit, not yet done:** any other screen that READS A VIEW and
WRITES ITS TABLE has the same shape. This is the only one found so far.

### The reviewer is found by role, not spelling — 2026-09-12 (v0.9.221, SQL to run)

The user: **"Bagyaraj would be mapped as nsm."**

0173 looked him up with `lower(name) like 'bagyaraj%'` — a prefix match on the
spelling alone, and both halves are fragile: the master may hold *"M Bagyaraj"*
or *"BAGYARAJ.M"*, which a prefix never finds, and a name is not unique.

`ffr_reviewer_backfill()` (0175) asks for **name AND role**, then name alone,
then role alone, and says which it used. It **refuses to guess**: several
matches, or keys that disagree, change nothing — a quality record naming the
wrong person is worse than one naming nobody, because blank is a question
somebody asks and a plausible name is one nobody checks. A left (`validity =
false`) master row is never chosen.

It is a FUNCTION as well as a migration step, because he may not be on User
Master yet — so it can be run after he is added, without re-running a bundle:

```sql
select * from public.ffr_reviewer_backfill();                 -- report only
select * from public.ffr_reviewer_backfill(p_apply => true);  -- set it
```

Dry run by default, and it fills silence only: a record already naming somebody
is never reassigned, on any run. Carries 0170's gate, since the SQL editor is
where it runs.

**To run:** `daily_review.sql`. `_status.sql` row 131 checks it.

### The real R-SER-03, an update log, and who reviewed it — 2026-09-12 (v0.9.220, SQL to run)

Four asks: the Word copy must be the template exactly; a printable HTML version
like the DC and the Declaration; the DCCR must record who reviewed it and put
that name on the FFR; and every FFR update must be captured for log keeping.

**THE CONTROLLED FORM, TAKEN FROM THE TEMPLATE FILE.** The first version treated
R-SER-03 as a *specification* and wrote a tidier document carrying the same
fields. That is not what a controlled form is. The template was pulled from
Drive (`R-SER-03 Field Failure Report Rev02`), its `document.xml` parsed, and
the layout extracted: the header band, the 6435/4500 grid, every label with its
exact wording **and internal padding** (which is how the printed form aligns its
colons), A4 with the template's margins, and the footer's
`TMPL No: R/SER/03 Rev: MAR 2020`. Verified by parsing both files and diffing
row by row — 15 rows, same order, same spans, same labels.

Two things the template does **not** have and the first version invented: an FFR
number field and a date field. Both removed; the number travels in the file name.

**ONE FORM, TWO RENDERINGS.** `src/lib/ffrform.ts` holds the rows; the Word
writer and the new `/ffr/:ffrNo` page both render them. A controlled form
transcribed twice is a form that drifts, so `check:ui` fails either renderer
that hand-writes a label.

**WHO REVIEWED IT (0173).** The screen stamped a reviewer only on Save — but the
DCCR also auto-saves and has a bulk path, neither of which sends a name, so
reports were raised naming *"Daily Call Review"*. The identity now comes from
`auth.uid()` in the database at the moment a stage becomes complete, on every
path, with the display name from User Master.

⚠️ **A fault found only by running it:** PostgreSQL computes a GENERATED column
**after** the BEFORE triggers, so the trigger's first version read
`new.review2_done` as NULL and stamped nothing — silently, everywhere. It
evaluates the completion test from the source columns instead, mirroring 0044's
expression; `check:ui` compares the two word for word and fails on drift.

**THE UPDATE LOG (0174).** `ffr_history`, one row per UPDATE, holding
`{column: {from, to}}` for only what differs. Written by a **database** trigger,
not the client — the application's audit trail is client-written and sees
nothing of an edit through the API. No insert, update or delete policy exists,
so it cannot be forged, edited or tidied; 0166's deletion guard is armed on it
too. Shown as "Update log" on the report.

**BAGYARAJ** is looked up in User Master and taken verbatim — never typed. If he
is not on the master the migration raises a notice and changes nothing, because
a name matching no user is worse than a blank one.

**To run:** `daily_review.sql` (0173) and `data_integrity.sql` (0174).
`_status.sql` rows 131 and 132 check them.

Validation package **Rev 2.3**: URS-058/059, FRS-069/070 (and FRS-067 restated),
R-37/38, FM-28/29, OQ-52/53.

### Signatures, Stock Out and the menu — 2026-09-12 (v0.9.219, SQL to run)

Three asks in one: save a signature, a Stock Out page, and a menu rearrangement
with matching permissions.

**A SAVED SIGNATURE (0172).** Its own table, not a column on `profiles` — RLS
grants by ROW, so a policy letting somebody save a signature on their profile
row lets them rewrite the role and permissions on it. Read and write test
`user_id = auth.uid()` and nothing else: **no administrator can read one or set
one**, deliberately, because a mark a second person can obtain is one they can
put on anything. An administrator can ask WHO has saved one
(`user_signature_status()`) and can remove a leaver's
(`remove_user_signature()`), never see one.

Two things the test found that would otherwise have shipped:

* `or is_admin()` on the DELETE policy **does nothing** — Postgres applies the
  SELECT policy to a `DELETE ... WHERE`, so the administrator who cannot read
  the row got `DELETE 0` and no error. Removal is a function instead.
* the "who has one" report is a definer **function**, not a view: a definer view
  over RLS tables is the 0040/0050/0057 fault, and `check:views` refuses one.
  Writing an exception into that check to admit this would blunt the control
  that catches the real thing.

On a document the rule is one line, in `src/lib/signature.ts`: **a signature
prints only in the block that names you.** Wired into the Delivery Challan (the
company block, when the printer booked the stock out) and the Field Failure
Report (when the printer is the raiser). Anybody else gets an empty block. The
FFR's Word file embeds it as a real image part — proved by generating both
variants and validating the zip, the XML, the relationship id, the content type
and the aspect ratio; four kinds of unreadable signature each produce a valid
document with an empty block rather than one Word refuses to open.

**STOCK OUT (0171)** is the same `StockOuts` component the Pending Dispatch tab
uses, exported rather than copied, on `/stock-out`. `mod:/stock-out` is merged
into every role already holding `mod:/spare-dispatch`, so nobody loses the list
they were reading; a role with NO permissions is left alone, since an empty
array means "not configured" and writing one key into it would turn that
fallback off.

**THE MENU** moved seven things and the order of two groups; `PERM_TREE` moved
with it. No path changed, so no role gained or lost access — `check:ui` compares
the nav with `MODULES` on every run.

**To run:** `rbac.sql` (0171 + 0172). `_status.sql` rows 129 and 130 check them.

Validation package **Rev 2.2**: URS-057, FRS-066..068, R-36, FM-27, OQ-51 —
written as a confidentiality requirement, and stating plainly what it is not: a
reproduced image, not a cryptographic signature, binding nothing to the
document's content.

### The back-fill refused the administrator running it — 2026-09-12 (v0.9.219, SQL to run)

Reported from use: `select * from public.backfill_ffrs();` in the Supabase SQL
editor answered *"Only an administrator may back-fill the Field Failure
Register."*

0169 guarded it with `is_admin()`, which reads `auth.uid()` — **NULL in the SQL
editor**, so the gate could never pass there, and the SQL editor is the only
place a one-time catch-up is ever run.

0170 aims it instead: a call that arrived **through the API** must be an
administrator (`request.jwt.claims` is set by PostgREST and by nothing else). A
direct database connection already has every table and every function; a role
check inside one guards nothing it could not step around by writing the INSERT
itself. `anon` is still kept out by the grant, so the claim test is never the
only defence.

**To run:** `daily_review.sql`, then the dry run and the real one.

### FFR raised by the review — 2026-09-12 (v0.9.216, SQL to run)

The user's rule: **a call answered YES for ANY POTENTIAL EFFECT in the DCCR
creates an FFR from the review's details, dated the day REVIEW 2 was
completed.**

A TRIGGER, not a screen action (0167). `any_potential_effect` is a generated
column — YES when any of Risk to Patient / Warranty Failure / Frequent Failure
is YES — so the answer is made by writing the review. A register that waits for
somebody to press a button afterwards has holes in it.

One per call (review 2 is re-saved constantly); reads the BASE call tables, not
the `calls` view, because a security_invoker view inside a definer applies the
CALLER's policies and a call it cannot see is a report it fails to raise
silently; and it never undoes itself — an answer changed back to NO leaves the
report standing (0049) and the register marks it **withdrawn**.

`field_failure_register` is the record beside the live call — status, engineer,
visits, spares and all three review answers — which is what "all the live data
should show for analysis and decisions" asks for. security_invoker, so a reader
sees only what their role allows.

**To run:** `daily_review.sql`. `_status.sql` row 127 checks it.

⚠️ **Still unsettled before any import of the 35 sheet rows:** "Call Solved Date
& Time" is exactly the visit date **+ 1 day** in all 20 rows that carry both —
too consistent to be people filing late, so it looks like the sheet's own
formula. The app uses the visit date.

### Field Failure Register built — 2026-09-12 (v0.9.214, SQL to run)

The placeholder is gone. `field_failure_reports` (0165) carries the
Field_Failure_Register 2026 tab's columns — minus the 17 AutoCrat plumbing
columns, because the document is generated by the app now. Raised from the
Daily Call Review; the call and its visit fill it in.

The NUMBER is the database's: `FFR - NNN/YY`, restarting each year and **seeded
past what is already on record** — 2026 reaches FFR - 035/26, so a counter
starting at one would re-issue numbers that exist on paper. Issued once, never
editable.

The Word report is written by `ffrdoc.ts` rather than filled into the supplied
template, and that is a decision worth knowing: the template's `<<Field>>` tags
are SPLIT ACROSS RUNS in the XML, so a search-and-replace finds nothing, and
patching it would need an inflater plus a run-joiner in the browser. The
template is treated as the SPECIFICATION and the document carries "R-SER-03
Rev 02" so a reader can tell which form it follows. **If byte-fidelity to the
controlled .docx is required, that is a decision for RA/QA and a different
build.**

`zip.ts` was lifted out of `xlsx.ts` when the second office format arrived —
one CRC table and one offset table rather than two that must agree. The
workbook export was re-verified by building one and reopening it.

⚠️ **check:replay caught a real fault:** the retention trigger was filed beside
the table, but `block_hard_delete()` lives in `data_integrity`, which runs
LATER in ALL_ORDER — a fresh apply failed on a function that did not exist yet.
It is now 0166, in that module, guarded on the table's presence.

**To run:** `daily_review.sql`, then `data_integrity.sql` for the retention
trigger. `_status.sql` row 126 checks both.

**Not done, and deliberately:** the 2026 tab's 35 existing rows are NOT
imported. The tab was given as the FORMAT. Importing is a separate decision —
the counter already refuses to collide with them either way.

### Call Request, redesigned — 2026-09-11/12 (v0.9.199 → v0.9.210)

The module now works the other way round: **the machine names the customer**.
Product → Serial → the customer, city, state and address come off the machine;
the first call fixes the customer for the request and the rest inherit it. The
customer search is gone from the form entirely, which is what the timeouts were.

Written up as [`CALL_REQUEST_REQUIREMENTS.md`](CALL_REQUEST_REQUIREMENTS.md) —
CR-001…CR-030, each with its status, because the reasoning was otherwise spread
across a dozen commit messages and the next person to touch the form would have
had to reconstruct it.

Two of those requirements are easy to undo by accident and are asserted:
CR-006 (the party filter on the machine search stays CONDITIONAL — an
unconditional one puts the slow search back in front of the fast one) and CR-024
(`cr_read` evaluated once per query: 1,840 ms → 7.4 ms for an engineer).

⚠️ **Still to run on the live project:** `call_requests.sql` for 0164 (CR-024),
and the one-line duplicate-index drop from 0161.

### One spare lost from every visit — 2026-09-11 (v0.9.200, shipped, no SQL)

Reported: *"In Spare Consumption, always 1 Consumption is getting Missed — looks
like the first Spare is always Ignored."*

**The picker's own line was never saved.** `CallReporting` kept committed lines
in `spares` and the line being entered in `spareDraft`, and the insert read
`spares.map(...)`. A spare chosen, counted and visible on screen was discarded
unless the engineer pressed **＋ Add** first. Exactly one line short, every time,
with no error — and it read as "the first" because a visit with a single spare
loses all of it.

It cost twice: the consumption record missed a part that went into a machine
(a quality record), and hand stock is DERIVED from consumption, so the
engineer's balance stayed high by that part.

Ruled out first, both by reading and by test: the cap trigger
(`0061_cap_all_consumption.sql`) RAISES rather than dropping, and all lines go
in one insert, so a refusal would abort the whole statement; and the register's
paging has no off-by-one.

Fixed by extracting the Add button's validation into `draftLine()` and running
it from `save()` — **the same rules both ways**, because a line Save accepts on
easier terms than Add is a record nobody checked. A draft that fails stops the
save with the reason instead of vanishing.

**Second defect found in the same module:** `loadMore` dropped `_dbId`, so a
consumption line past the first 1,000 could not be adjusted or voided — it
answered *"This line has no database id — Refresh and try again"*, and Refresh
reloads page one. Since 0049 blocks deletion, voiding is the ONLY correction
available, so those lines were uncorrectable. One line to fix.

`check:ui` pins both, and all three assertions were mutation-tested — including
reverting the insert to `spares.map` and watching the check go red.

### The product serial is mandatory — 2026-09-11 (v0.9.199, SQL to run)

A call request went in as `R18627-MONNAL T75-NA` — no serial, so the UniqueID
named no machine. Every downstream lookup then matched the wrong unit or none,
and the call's party, city, state, item status, warranty and contract all had to
be corrected by hand against the Product Master.

Shipped: `serial` is `required` on `FIELD_CALL_FIELDS` (which serves Field Call,
Installation, PM **and** Pending Registrations, so one change covers the four),
and `RequestCallRegistration`'s hand-written `validate()` refuses an item without
one. On an installation it is typed; everywhere else the message names the real
cause — *the machine is missing from Product Master*. `npm run check:ui` pins
both, and each assertion was mutation-tested.

Also: `Form.tsx`'s `required` check now trims, so a field can no longer be
satisfied by the space bar. That gap applied to every required field on every
form, not just this one.

**To run:** `supabase/apply/tracker.sql` — it carries `0162_tracker_nl_team.sql`,
which renames the tracker's *With whom* from `Claude` to **NL Team** (the user's
rule, 2026-09-11: the assignee is a team somebody can chase, not a tool). Eight
rows. Idempotent, and it must stay LAST in the `tracker` module or the seeds
replay `Claude` straight back — `check:ui` asserts that position.

⚠️ **Corrected by hand, still open:** the Product Master row for serial 10915
(MONNAL T75, Advanced Neurology And Multispeciality Hospital, Jaipur) was never
checked. The call was fixed; if the master is what is wrong, the next call on
that machine repeats it.


### Waiting on the user

| | what | where |
| --- | --- | --- |
| 🔢 | **The PM count is short** — 7,029 rows where two years at 10,000/yr should be ~20,000. Find out before nine years load through the same path. | *Nine years vs the 500 MB cap* |
| 📏 | **PM rows measure ~2× field-call rows** for identical columns. Bloat, or genuinely longer text? 140 MB either way across a backfill. | *Nine years vs the 500 MB cap* |
| 🔒 | **`handstock_period.closed_through`** — while NULL, none of the 68 MB of spare history can move without silently changing stock balances. | *Nine years vs the 500 MB cap* |
| 📄 | **What six AppSheet columns held** — CALL DETAILS, VISIT REMARKS, CHANGE PRODUCT?, SEND EMAIL FOR DEFECTIVE SPARE, SL NO(T), Complaint. Two sample rows would settle it. | *The reliability template* |
| 📊 | **Four objectives still typed** — FFR field failures, PM Calls, Installation call, b.Customer feedback. And the CPX failure rule. | *Objectives 8-12* |
| 🩺 | **Is any servicing subcontracted?** §7.5.4 says "the organization **or its supplier**". If any is, those records sit outside the daily analysis entirely and the gap is invisible from inside RITHI. Worth confirming either way. | *[ISO13485_SERVICING.md](ISO13485_SERVICING.md) SR-035/036* |
| 🩺 | **A complaint that never becomes a call has nowhere to live (SR-038).** The exposure the boundary decision created: either every complaint enters as a call, or the complaint register is elsewhere and this system feeds it. What cannot stand is the middle — a register presented as the complaint population with a route into complaints that bypasses it. | *[ISO13485_SERVICING.md](ISO13485_SERVICING.md) SR-038* |

✅ **THE CALLREG REDEPLOY IS DONE (2026-09-08, v0.9.150).** The user redeployed
and sent the new `/exec` URL, which is baked into `DEFAULT_SHEETS_URL` with
`DEFAULT_URL_VERSION` bumped to 10 — so every client supersedes its stored URL
instead of each device editing Settings. It was a NEW deployment rather than a
new version of the same one, which is why the URL changed; `DEPLOY.md` asks for
the same deployment precisely to avoid that, and the version bump is what makes
it not matter.

**Reported, not verified from here** — `script.google.com` is blocked from the
sandbox, so whether `drivefile` answers can only be seen by opening a report in
the live app.

📌 **A party spelled two ways showed no products** (2026-09-09, v0.9.174) —
"CAPTAIN SAURABH KALIA MEMORIAL KAYDEE HOSPITAL — This party has Products, but
this Party Doesnt". **Not where it looked.** `parties` CANNOT hold two spellings
(0076 puts a unique index on `lower(btrim(party_name))`); `products.party_name`
is unconstrained text, so an import filed machines under CAPITALS while the
party row spelled it Title Case. `sbPartyInfo` matched with `ilike`, the product
lookups with `eq` — the two halves of the app disagreed about whether case
mattered, and only one of them was right.

Fixed in code: the product lookups now narrow with `ilike` (the trigram index in
0052 serves it) and compare exactly on `lower(trim())` in the browser — because
in an `ilike` pattern `_` matches ANY character, so pattern-matching alone would
quietly pull in neighbours. **No SQL needed.**

OPTIONAL tidy-up, dry-run by default:
<https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/_party_name_normalise.sql>
— re-spells product rows to their party row's spelling, and separately lists
products whose party has no row at all (nothing to normalise TO; somebody has to
add the party).

📌 **"I am not able to add users to Admin / Super User"** (2026-09-09) —
answered, and two things were wrong, one of them ours.

**Super Admin is not a role and no screen can grant it.** It is a row in
`public.app_super_admins` matched against a hardcoded `SUPER_ADMINS` set in
`src/lib/auth.tsx` — a migration *plus* a code change, deliberately, since it is
the account that overrides every other check. The dropdown said **"Admin /
Super Admin"**, which promised what it could not do; it now says **"Admin"**.

**Granting Admin needs `is_admin()`, which is not the same as holding
`users.manage`.** Two gates, and they differ:
`profiles_admin_write` (RLS) asks `has_perm('users.manage')` — that lets you
edit users at all; `profiles_role_guard` (TRIGGER) asks `is_admin()` —
`profiles.role = 'admin'` OR your login in `app_super_admins`. So a role with
`users.manage` edits users all day and is refused on that one value with
*"RBAC: granting admin requires an administrator"*.

**The trap, verified against a database:** it is a TRIGGER, not a policy, so the
SQL editor does **not** get round it — there `auth.uid()` is NULL, `is_admin()`
is false, and the same refusal comes back. And **nobody promotes themselves**,
administrators included (only a super admin may), so the last administrator
cannot re-grant themselves. Bootstrapping the first one therefore needs the
trigger lifted for a single statement — the snippet is in
`_admin_grant_check.sql`, re-enabling inside the same transaction.

**The first version of that check was useless where it would be run**: it asked
`auth.uid()`, and the SQL editor has no signed-in app user, so every line came
back `(not signed in)`. Rewritten 2026-09-09 to take an EMAIL and answer from
the tables — it says in one line whether that person can grant Admin, which gate
stops them, and **who can**, so "ask one of these people" replaces guessing.

Read-only diagnosis:
<https://github.com/neurolooom-eng/RITHI_CRM/blob/main/supabase/apply/_admin_grant_check.sql> ·
copy it:
<https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/_admin_grant_check.sql>

📌 **The dropdown design default is written down** (2026-09-09, v0.9.179) —
"Type Search and select, fallback or no fallback depends on the field". It lives
in `CLAUDE.md` under Gotchas, and it is enforced rather than remembered:
`Form.tsx` renders `type: 'select'` as a `SelectPicker`, so every FieldDef form
(Field Call, Installation, PM, Pending Registrations) inherits it and so does the
next one; `check:ui` fails a NEW `<select>` in a module and holds a shrinking
list of the ones still to convert.
**Standard Complaint takes no fallback anywhere** — the register (callFields),
the Visit Report and the Call Registration request all lost their free-text
branch. **The sweep is FINISHED** (2026-09-09, v0.9.180): all ~50 converted, and the
guard is now absolute — `check:ui` fails on **any** native `<select>` in `src/`,
not against a shrinking list of exceptions. A list of "still to convert" was
right while the conversion was in flight and a loophole once it was done.

📌 **Indoor Service — the ACTIVITY TYPES are settled, the plan is extended**
(2026-09-09). Vignesh gave four (recycling/rework, pre-delivery checking, demo,
other); the proposal makes them **six** and says why: **Repair** was missing (it
is what §4.5 is actually about), and **rework and salvage are two activities**,
not two words — §8.3.4 governs one and SR-017 the other. `activity` is a SECOND
AXIS beside `kind`: kind says whose property it is (custody, §7.5.10), activity
says what is being done to it, and one field cannot carry both.
Fields per activity are in `docs/INDOOR_SERVICE_PLAN.md` and the artifact
<https://claude.ai/code/artifact/2f1a1fd7-71b4-4972-bdc9-4bd7d38f686d>.
**Still a PLAN — nothing is built.** Four new questions (6–9) are open at the end
of that file, the sharpest being whether a salvaged part re-enters stock under
its own code; if it does not, its condition grade is decoration.

✅ **THE FOUR BUNDLES ARE APPLIED — VERIFIED (2026-09-09).** `rbac.sql`,
`performance.sql`, `daily_review.sql` and `Spare_1.sql` were run, and the
`_status.sql` output was read back: **every row `yes`**, rows 113–117 included.

That is the distinction this file exists to hold, so it is worth being exact
about what the evidence covers. These rows test the PROPERTY, not merely that an
object exists:

* **115** — the `parts_category_check` constraint is GONE, so a Part Master
  upload can no longer be refused part-written over a category word.
* **116** — `spare_pending_rm` carries `complaint` **and** `security_invoker` is
  still on it. A rebuilt view that lost that setting would read as its owner and
  hand every signed-in user every engineer's requests, with no error; the row
  would have said `no`.
* **117** — `zoho_migration` still holds everything `technical_support` holds
  AND none of the actions a write policy names. A drifted or writable clone
  fails this row rather than passing it.
* **114** — `technical_support` still carries every module key the admin role
  does, so a page added later has not silently skipped it.
* **113** — `spare_insights` exists and is NOT `security definer`.

Also confirmed by the same output: the frequent-failure row reads the PROCEDURE's
rule (0153) — one month, counting the call under review, with the same-part path
— and asserts `frequent_failure_history()` is gone, so no stale caller can get
the old six-month answer.

<details><summary>The PENDING notes these replace</summary>

⚠️ **PENDING: `Spare_1.sql`** (2026-09-09, v0.9.165) — at the REPOSITORY ROOT,
not under `supabase/apply/`: it and `HandStock_X.sql` are the two numbered
consolidated files handed round, where the number is a revision. (A link to the
`supabase/apply/` path was given first and 404'd.) 0154 adds `complaint` to
`spare_pending_rm` so RM Approval can show what the spare is being asked for
(`_status.sql` row 116). Everything else the screen gained was already in the
view. The view is **dropped and rebuilt**, not replaced — `create or replace`
can only append, and 0116's narrower definition has to stay replayable after
this; `security_invoker` is re-asserted, and `check:views` passes. Read it:
<https://github.com/neurolooom-eng/RITHI_CRM/blob/main/Spare_1.sql> ·
copy it:
<https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/Spare_1.sql>

⚠️ **PENDING: `daily_review.sql`** (2026-09-09, v0.9.163) — 0153 replaces the
frequent-failure test with the procedure's own rule (`_status.sql` row 77).
Until it runs, Review 2 still applies a **six-month** window, still reads the
count **one short** of the rule, and still has **no same-part path** at all.
Read it:
<https://github.com/neurolooom-eng/RITHI_CRM/blob/main/supabase/apply/daily_review.sql> ·
copy it:
<https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/daily_review.sql>

⚠️ **PENDING: `performance.sql`** (2026-09-09, v0.9.162) — 0152 drops the
`parts_category_check` constraint, which aborted the Item Master upload 173 rows
in and left the table half-written (`_status.sql` row 115). The importer fix
ships with the app and needs no SQL; this one stops the whole CLASS of failure,
so an unexpected category word can never refuse a row again. Read it:
<https://github.com/neurolooom-eng/RITHI_CRM/blob/main/supabase/apply/performance.sql> ·
copy it:
<https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/performance.sql>

⚠️ **PENDING: `tracker.sql`** (2026-09-08, v0.9.158) — the Tracker catches up
with this file: eight items added (0150), the three parked decisions and the
13485 findings. Additive and idempotent by title; nothing already on the list is
closed, renamed or touched. Read it:
<https://github.com/neurolooom-eng/RITHI_CRM/blob/main/supabase/apply/tracker.sql> ·
copy it:
<https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/tracker.sql>
(It also carries the Air Liquide ID item from 0146, if that has not been run.)

⚠️ **PENDING: `tracker.sql`** (2026-09-08, v0.9.152) — one seeded item, *"Collect
every engineer's Air Liquide ID"*, owned by **Devika** (0146). Read it:
<https://github.com/neurolooom-eng/RITHI_CRM/blob/main/supabase/apply/tracker.sql> ·
copy it:
<https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/tracker.sql>
It is a row somebody could equally add on the page in twenty seconds; the
migration exists so it also travels with the bundle.

🔎 **WHY THE HOTLINE DESK SAID "RITHI ADMIN", found while writing the fix
(2026-09-08).** `default_registrant()` (0114) resolves the desk from the
`calls.default_registrant_email` setting, or from the single hotline profile
where there is exactly one. Where neither holds it returns NULL, and the stamp
falls back to `coalesce(default_registrant(), auth.uid())` — **whoever
registered the call**. So every call registered from the admin login was filed
to the admin desk, which is what the screenshot showed.

`supabase/apply/_hotline_desk_fix.sql` corrects the calls already filed that
way. **Setting the default registrant on Admin Config is what stops it
recurring** — otherwise the next person to use the admin login reproduces it
exactly.

</details>

📌 **KNOWLEDGE BASE IS A SECTION, AND A CALL REQUEST OFFERS ITS DOCUMENTS**
(2026-09-09, v0.9.183) — four asks, no SQL.

**The guide was the bottom half of another page.** "How to use RITHI CRM" sat
below Field Solutions on `/knowledge-base`, so the thing a new starter needs
first was the thing they had to scroll past a wall of team articles to reach.
It is now `/knowledge-base/how-to`, its own topic: a page somebody is *sent* to
should be a place, not a position.

**And all the how-to content is on it.** An article filed under the `How-To`
category was sitting among the field solutions, where nobody looking for
instructions would search. Both lists now split on ONE exported constant
(`HOWTO_CATEGORY`), so an article cannot land on both pages or on neither — and
the filter runs BEFORE the search, or a How-To article would surface among the
solutions the moment anybody typed. Writing one still happens on Field
Solutions, where the editor is: the category decides where it is READ.

**Knowledge Base is the nav heading** (it was one item under "Help"), and
**Service Manuals moved under it** — with the things people read to do the job.
QMS Documents stays under Documents: those govern the work rather than explain
it, which is why their write right is separate. `check:ui` fails Service Manuals
appearing in BOTH groups, which would be worse than the wrong group — two
entries for one page.

✅ **Field Solutions is a third topic — CONFIRMED, not a judgement any more.**
It was shipped as a judgement call (the ask named one topic and then added
Service Manuals) and flagged as one line to remove. The user, same day:
*"users should be able to add Field solutions.. No change to that requirement"* —
so it stays, and the ＋ Add article button stays with it, for any signed-in user.

**One thing the split could have cost somebody, now closed.** An article filed
under `How-To` is READ on the How to Use page — so publishing one from Field
Solutions and watching the list not change reads as the save having failed, and
the natural response to that is to write it again. The category picker now says
where the article will be read BEFORE it is saved, and the confirmation after it
names the page and offers to open it (v0.9.184).

**Supporting documents now reach a call REQUEST** — the request view and the
registration form. The component is the CALL's own (`SupportingDocs`, exported
from `CallAssociations.tsx`), imported rather than copied, so the matching rule
cannot drift between the two screens; `check:ui` fails either screen growing its
own `serviceManualsForProduct` call. On the form it renders **per machine**,
because a request may carry several and one panel under the whole form would
offer the first product's manual for every row.

**The lookup is now DEBOUNCED, and that is not a nicety.** `serviceManualsForProduct`
fetches the whole table and matches in JS — there is no narrowing query — and on
the form the panel sits under a *live* Reported Problem textarea that the effect
depends on. Every keystroke was a full table fetch. 350 ms; on a call, where all
three inputs are fixed, the timer fires once and nothing is different.

🐞 **"Why is it now Engineer" — A ROLE ON THE USER MASTER NEVER REACHED THE
SIGN-IN** (2026-09-11, v0.9.198). DEEPIKA M shows as *"Zoho Migration (now
Engineer)"*.

**The column was telling the truth and the truth was the bug.** That cell
compares two different stores: `user_directory.role` (the User Master, what she
was GIVEN) against `profiles.role` (her sign-in, what she HAS). **`can()` reads
the profile**, so she is an engineer in every way that matters — a read-only
migration login running with an engineer's write actions.

**Why they drift:** `UserMasterView.persist` is the ONLY path that writes the
role through to `profiles`, and it runs only when an admin saves THAT ONE ROW on
that screen. `user_directory` is also a bulk-import target (Data Import), and
`ensureMyProfile()` builds a profile from the directory on FIRST sign-in only —
so a role changed after somebody has signed in, or loaded in bulk, never
arrives. Silently: the person simply finds buttons missing.

**This is very likely the same fault behind "same user but some actions are
missing"** (Varun, 2026-09-11) — the report that could not be resolved from
here. The My Profile panel added in v0.9.194 answers it directly now: it says
which role is in effect.

**The fix keeps the admin in charge rather than guessing a source of truth.**
The User Master counts everyone whose sign-in disagrees, says so at the top of
the screen, and applies the list's role to all of them in one action. A failure
is NAMED, not counted — "3 of 5 applied" is not something anybody can act on,
and these are permissions. Each change goes to the audit trail as
`user.role.apply`.

**What is deliberately NOT done: making one of them automatically win.** The
directory is the origin (it builds the profile on first sign-in) but User Access
is where a role is managed afterwards, and silently overriding a deliberate
change there would be a worse fault than the one being fixed.

✅ **THE DIAGNOSTIC CAME BACK AND THE DATABASE IS HEALTHY** (2026-09-11,
v0.9.197). Their numbers, against a rehearsal that had guessed 22,000:

| | |
| --- | --- |
| products | **19,253** — SMALLER than the rehearsal |
| parties | 5,873 |
| parts | 1,324 |
| distinct party names in products | **4,851** |
| `statement_timeout` for `authenticated` | **20 s** |
| the three-filter search that "timed out" | **4.3 ms** |
| the customer picker | **37.7 ms** |
| a short serial alone (the 0129 trap) | **0.06 ms** |

**All four critical indexes are present.** Nothing measured comes within three
orders of magnitude of the 20-second limit. **The timeout was not the query**,
and the most likely explanation is that it was transient — `performance.sql`
creates indexes on `products`, and a CREATE INDEX competing for I/O is exactly
when a one-off cancellation appears. Recorded rather than chased further: there
is nothing left in the evidence to chase.

**AND THE REAL ANSWER TO "NOTHING MATCHES" WAS IN THE NUMBERS, not the
timeout.** 5,873 parties, 4,851 of which own a machine — **about a THOUSAND
customers are on the Party Master with nothing against them.** On a field call
those are not offered, by the design settled on 2026-09-10 (the cascade looks
the products up BY the name). "Nagapattinam Medical College" and "HKSD" are very
likely among them, and the picker was telling the truth — just unhelpfully.

**So they are now LISTED AND UNPICKABLE, with the reason on the row** —
"— no machine on record". PickList already had that shape (`isDisabled`), used
where a spare with no stock is shown so the engineer can see WHY it is not an
option. **Answering "Nothing matches" about a customer somebody is looking
straight at is a lie by omission**, and it hides the actual problem: that
customer's machine has not been registered yet.

`Form`/`SelectPicker` gained `isDisabled` and `labelForOption` to carry it, and
the two rules COMPOSE — a field adding its own must not replace the list's, or a
spare with no stock would quietly become pickable. That composition broke under
a mutation and nothing caught it, so it has an assertion now.

**Part Master reading 0 is not a fault either**: `parts` holds 1,324 rows and
`parts_read` admits any signed-in user. The nav badge is what that screen has
LOADED, and it had not been opened.

**One gap in the diagnostic itself, worth remembering**: it runs as the SQL
editor's role, which BYPASSES RLS — the exact mistake the KPI export fix wrote
down ("a performance check that does not `set role authenticated` is not a
performance check"). It did not matter here, because `products_read` and
`parts_read` are `auth.role() = 'authenticated'` with no subquery, unlike
`reports_read`. But the file should compare both, and does not yet.

🐞 **"all issues related to Product Database. .. Something is awfully wrong"**
(2026-09-11, v0.9.195).

**FIRST, THE REASSURANCE, because the screenshot invites the opposite reading:
NO DATA IS MISSING.** Product Master's "200" is `PAGE = 200` in that module and
Party Master's "1,000" is its own page size. They are how many rows the screen
loads at a time, not how many exist. Worth stating plainly — a person looking at
"Product Master 200 / Part Master 0" is entitled to fear the register has been
emptied.

**THE LIE WAS MINE, AND IT IS THE WHOLE REASON THIS FELT CATASTROPHIC.**
`sbSearchProductParties` failing left `PickList` with `.catch(() => {})`, so a
TIMEOUT rendered as **"Nothing matches 'Nagapattinam Medical College'"**. The
comment directly above that line read *"'nothing matches' and 'the request
failed' must not look the same"* — I wrote the principle and then implemented
its opposite two lines later, and a comment is not a check, which is why there
is now an assertion. On a call desk the consequence is not cosmetic: the person
concludes the customer is not on the system and raises them again as a
duplicate.

A failed search now says the list is empty **because the search failed**, says
it is not evidence the customer is missing, and clears itself on the next
success.

**THE TIMEOUT ITSELF IS REAL AND NOT YET EXPLAINED.** The same three-filter
search — party `vivek`, product `monnal t75`, serial `7680` — runs in **6.9 ms**
against a rehearsal database of 22,000 machines, planning a bitmap scan on
`products_item_name_trgm`. So the answer is in THEIR database, not in the query,
and guessing at it from here is how the last two rounds were spent.

⚠️ **AND THE FIRST VERSION OF IT WOULD NOT RUN** — `ERROR: 42601: syntax error
at or near "\"` on line 14. It was written for **psql**, using `\echo`, `\pset`
and `\timing`; the Supabase SQL editor is not psql and has none of them. **Every
other file in `supabase/apply/` is pure SQL for exactly that reason** — it is
written to be pasted into that editor — and this one broke the convention
without noticing. Rewritten as ONE query returning one table, so it is one paste
and one screenshot.

The rewrite creates exactly one thing: a function in **`pg_temp`**, the
throwaway schema that lives for a single connection and cannot outlive it —
needed because EXPLAIN cannot otherwise be put in a UNION. `check:ui` now
refuses any other write, refuses a psql meta-command anywhere in the file, and
refuses the ordering being changed back: the first rewrite ordered by name, which
sorted each EXPLAIN alphabetically. **A plan sorted alphabetically is a word
list, not a plan.**

**`supabase/apply/_search_diagnose.sql`** asks the four questions that separate
the possibilities and prints them: the real row counts, every index on
`products` with its kind and size, the `statement_timeout` actually in force,
and `EXPLAIN ANALYZE` for the three failing shapes — including a **short serial
on its own**, which is 0129's documented trap (four characters give a trigram
index almost no selectivity). Read-only; `check:ui` refuses it if it ever gains
a write.
<https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/_search_diagnose.sql>

**A DUPLICATE INDEX, FOUND BY THE DIAGNOSTIC ON ITS FIRST RUN.**
`products_party_name_group_idx` (0160, mine) and `products_party_name_eq` (0052)
are character-for-character the same `btree (party_name)`. Every insert and
update to `products` maintained both, and the Product Master upload writes the
whole register — so a bulk load paid for it 21,000 times. 0161 drops mine and
keeps 0052's, whose own comment explains why it exists. The diagnostic answered
a question it was not asked, which is the usual way a duplicate index is found:
nobody goes looking.

🐞 **FOUR REPORTS FROM VARUN SARADHI** (2026-09-11, v0.9.194). Taken in order
of what could be PROVED from here.

**1. "same user but some actions are missing" — an administrator previewing him
saw the Visit Entry and Request Spares buttons; he saw neither.** Both go through
the SAME `can()`, so the difference had to be in its INPUTS — and neither screen
showed what those were. Traced as far as the code allows from here: the policies
are symmetrical (`ar_read` lets anyone signed in read `app_roles`;
`profiles_self_read` lets anyone read their own row), `permsForRole` is shared,
and both identities are built by the same `profileToUser`. **What it could not
be resolved against is their live data**, so the fix is to make it answerable
rather than to guess: **My Profile now states the role key in effect, WHERE the
permissions came from — the stored role row or the built-in defaults — what is
held, and what is granted personally.** One screenshot now settles it.

That stored-versus-default distinction is the one this project keeps being caught
by (0151, and the `has_perm` gate note in CLAUDE.md): **a role whose `app_roles`
row is absent or EMPTY falls back to the defaults silently**, so it can look
configured on Roles & Permissions and behave like something else. If Varun's
panel says "the built-in defaults", that is the answer.

**And a real fault found on the way: `sbCurrentProfile` swallowed its error.** It
read `const { data }` and dropped the error, falling through to a synthesised
bare-engineer identity — so a failed read of somebody's own profile signed them
in with the minimum access and nothing anywhere said why. **A person quietly
downgraded reads as a broken app rather than as access not granted.** It now
throws; both call sites handle it (the boot still finishes, the sign-in still
returns a message) because throwing without handling would have hung the app,
which is worse than what it replaced.

**2. "it goes into not responding quite often" — FOUND, NOT YET FIXED.**
`sheets.ts` calls `listCalls(tab, limit || 100000)`: the register downloads **up
to 100,000 calls, a thousand at a time, every column**, then maps every row
through `dbToCall`. On a phone that is a hundred sequential requests and a very
large array before anything is interactive — Varun's screen showed 129 rows
because "Open only" filters CLIENT-SIDE, after all of them have arrived.

**Not changed in this round, deliberately.** The table, the grouping, the
counts and the CSV export all assume the whole register is in memory; moving to
server-side paging is a real change and not one to start at the end of a long
session. **Next step, and it needs a decision**: page the register server-side
and push "Open only" into the query, which is how the 129 rows become 129 rows
fetched.

**3. "The visit was saved, but the 2 spares could not be recorded: VARUN SARADHI
has 0 of MSA-125 in hand" — WORKING AS DESIGNED, not a bug.** The consumption
trigger caps every line at the engineer's hand-stock balance, and the message
names the part, the balance and who fixes it. Recorded here so it is not
"fixed" later by somebody reading the screenshot as a defect.

**4. The customer search showed the PREVIOUS results while a new one ran.**
Typing "The principal" listed hospitals beginning with A under a quiet
"searching…". The results were held as rows alone, so the last answer stayed on
screen until the next landed. They are now held WITH the query that produced
them and only shown when that matches what is typed. **Rows that contradict what
has been typed are worse than no rows: they read as the answer.**

Also caught while fixing it: the memo compares a LOWER-CASED query, so storing
the raw one would never have matched and the list would have stayed empty for
any query containing a capital. Normalised on both sides.

**FIFTH assertion this session to fail for pinning a shape** — it matched
`onSearch(query.trim())` and the code hoisted that into a variable. Rewritten to
the property.

🐞 **"party name and Product - both are taking about 8 & 4 sec -- is that
expected?"** (2026-09-10, v0.9.193). **No — and the honest answer was that
caching the wrong thing does not make it right.**

**What the measurements said.** The database was never the cost: the whole party
aggregate over 22,000 machines runs in **10.7 ms**, and `product_party_names`
plans a `Bitmap Heap Scan` on the trigram index. The 8 seconds was the SHAPE —
downloading 2,600+ names in three paged requests and a few hundred KB before the
field would work at all. v0.9.192 cached that, which helped the SECOND open and
did nothing for the first, and was going to get worse as the register grew.

**So the list is no longer downloaded. It is searched.** `PickList` gained an
`onSearch` prop: the box opens on a short first page and each keystroke asks the
database, debounced at 220 ms. Warm, on the seeded register: **0.4 ms** for
"karu", **1.5 ms** for "hosp", **25 ms** for the empty first page. It costs the
same at fifty thousand customers as at two thousand.

Applied to every customer field — the call registers, the call request and
Product & Party Search. **An INSTALLATION searches both** and puts the owners
first, because it reaches a customer who may have no machine yet; every other
call type searches owners only, since that name is what finds the products.

**THE DOWNLOAD IS DELETED, not left unused** — `sbListProductParties`, the
`productParty` master and the `ProductParty` type are gone. Dead code that still
looks alive is how somebody reintroduces the problem by calling the
convenient-looking helper.

**Two details the picker owes the reader.** A server-searched list does not know
the total, so it says *"N shown+"* rather than *"N of 40"* — the project's own
rule that a count over partly-loaded data is a lower bound, and 40 would have
been whatever happened to be seeded. And it no longer flashes "nothing matches"
while a search is in flight: an empty result and an unfinished request must not
look the same.

**Six assertions failed on this change and that was them working.** They pinned
the download — `useMaster('productParty')`, the paging, the shared fetch — which
is exactly the design being replaced. Two were retired outright (there is no
list to page any more) and the rest rewritten to the new property. A check that
survives its own subject being deleted was never checking the subject.

**And the earlier fixes still stand and mattered**: the product list is one
request rather than 21 (it was reading every machine in the register to find
forty names), the browser cache remains for the small lists, and the Party Master
is not fetched where it cannot be the answer.

🐞 **THE NEW CALL REQUEST FORM WAS SLOW TO OPEN, AND COULD HANG** (2026-09-10,
v0.9.192). *"it is still taking quite some time.. Even became non responsive
during 1 try.. cache it to the browser so that it loads quickly. or whatever is
the best practice."*

**FOUR THINGS, and the biggest was not the party list at all.**

1. **`listMaster('product')` read EVERY MACHINE IN THE REGISTER.** It called
   `distinctColumn('products', 'item_name')`, which pages a thousand rows at a
   time — **21 sequential round trips pulling 21,000 rows** — to arrive at about
   forty distinct names. `product_register_names` (0098) has done that DISTINCT
   in Postgres since it was written and this call simply never used it. On a
   phone, 21 sequential fetches is the "non responsive". **One request now.**
2. **The party list was fetched TWICE per page load** — once by the picker, once
   for the machine counts beside each name, each a full walk of the paged view.
   `sbListProductParties` now holds the PROMISE rather than the rows, so two
   callers racing on first render join one request instead of starting a second.
3. **The Party Master was downloaded on every call type**, on the reasoning that
   the session cache makes it one request. True — but that one request is
   thousands of names paged a thousand at a time, and on a field call or a PM
   **not one of them can be the answer**. `useMaster` gained an `enabled` flag;
   it is fetched only for an installation.
4. **Nothing survived a reload.** The master cache was a `Map` in memory, so
   every page load re-fetched every list.

**THE CACHE IS STALE-WHILE-REVALIDATE, which is the shape that helps.** The
stored copy goes on screen IMMEDIATELY and the fetch still runs, swapping in
when it lands — a cache that blocks until it has revalidated is a slow fetch
with extra steps. Consequence, stated plainly because somebody will notice: a
customer added a minute ago appears on the NEXT load, not this one. "Clear Cache
and Update" forces it, and anything stored is abandoned after a week regardless.

Stored as one newline-joined string rather than JSON — a few thousand names is a
few hundred KB and `JSON.stringify` on an array of strings spends a third of that
on quotes and commas. A `STORE_VERSION` constant abandons every stored list at
once, because a change in what a list MEANS must not be served from a copy of
the old one. **An EMPTY answer is never stored**: it is usually a failed request
or a permission the reader has not got, and storing it would serve that
emptiness back for a week. Every access guarded — a private window throws on the
accessor itself, and a form that will not open because a cache is unavailable is
worse than one that is slow.

**One assertion had to be rewritten, and this time for a good reason.** It pinned
`export async function sbListProductParties` and the paging moved into a helper
when the shared-fetch wrapper was added — the property held, the shape changed.
It now follows the READ of `product_party_names` wherever it lives. **Fourth
time this session**; the rule in this file has earned its place.

**And the mutation test was done properly this time.** Every one of the five
mutations printed a confirmation that it landed where it was aimed before
`check:ui` was run — after the near-miss on v0.9.191, where a count-of-1 replace
hit a different function and the check passed on unchanged code.

🐞 **THE PARTY LIST WAS TRUNCATED AT 1,000 — my regression, one day old**
(2026-09-10, v0.9.191). *"KARUNALAYA TRUST, PUNE is very much available, but it
is not coming up in Call request"*, with Product Master showing its machines on
the next screen.

**The screenshot named the bug: the picker's footer read `0 of 1000`.**
`sbListProductParties` (v0.9.190) fetched the view in ONE request with no
`range()`, and **PostgREST caps a single response at ~1000 rows and says nothing
about it**. Ordered by name, that returned A through roughly J and dropped
everything after — which is why the visible matches in the other screenshot were
ADHIKARI, ADI SHANKAR, ADKAR, AMBEDKAR, AMBEKAR, Amit, APPLE. All A.

**Reproduced before fixing**: 2,601 parties seeded with a realistic
alphabetical spread put KARUNALAYA at position 1,201. One capped request — NOT
found. Paged — found on page 2.

**This file already carried the warning**, at `listCalls`: *"Supabase caps a
single response at ~1000 rows, so page through with `range()`"*. The idiom
appears seven times in `supabase.ts`. I wrote the eighth without it.

**A TRUNCATED LIST IS THE WORST SHAPE THIS CAN FAIL IN**, and that is the part
worth remembering. It does not look broken: it looks like a working list that
does not contain your customer. So the reader concludes the customer is not on
the system — and on a call desk the next step is raising them again as a
duplicate, or giving up. An empty list would have been safer, because an empty
list is obviously wrong.

**And a near-miss on the check.** The first attempt to prove the new assertion
discriminates replaced `.range(from, from + PAGE - 1)` with a count of 1 — but
that idiom appears seven times, so it mutated a DIFFERENT function and the
assertion still passed. It read as "the check discriminates" when nothing under
test had changed. **Verify the mutation landed where you aimed it**, not just
that you ran one; this is the same vacuous-assertion trap in a new costume.

**The audit that followed was crude and is worth not over-claiming.** Splitting
`supabase.ts` on `;` flagged the `let q = …` line of functions that DO page
(`listHandstockBalance`, `listAllHandstockMovements`), so most hits were false.
Checked properly, those are bounded correctly and **this was the only genuinely
unbounded fetch**. What remains unbounded and is fine TODAY, but would truncate
silently if it grew past a thousand: `profiles`, `app_user_names`, `documents`.
Not changed — flagged.

✅ **`performance.sql` IS APPLIED — VERIFIED (2026-09-10).** The user ran it and
pasted the `_status.sql` output: **rows 121 and 122 both read `yes`**.

* **121 — the KPI export.** It tests the PROPERTY: `kpi_field_inst` still has its
  LATERAL shape and still carries `security_invoker`, and the `spare_requests`
  index is there. So the export is fast for people who are not administrators —
  which is the entire point, since as superuser it was never slow.
* **122 — the party cascade.** `product_party_names` exists and reads as the
  READER, not its owner.

⚠️ **BUT `tracker.sql` HAS STILL NOT BEEN RUN — row 119 reads `NO`, for the
second time.** "ran all sql" (2026-09-10) evidently reached `performance.sql`
and not this one; it has been outstanding since v0.9.181 on 2026-09-09.

**This is the second time row 119 has earned itself.** It was added precisely
because a SEED leaves no table, policy, function or view behind — every other row
in that report tests an OBJECT, and rows are not objects. Without it this bundle
would read as applied twice over, and the six open points would simply never
appear on the Tracker with nothing anywhere to say why.

**It is one file and nothing depends on it**, which is probably why it keeps
slipping: no screen is broken while it is unrun, the Tracker simply does not
carry the six items.
<https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/tracker.sql>

<details><summary>What was applied</summary>

⚠️ **PENDING: `performance.sql`** (2026-09-10, v0.9.190) — **EVERY
PARTY→PRODUCT→SERIAL CASCADE READS THE PARTY LIST FROM THE PRODUCT REGISTER.**
The user: *"loop the Product Master instead of Party Master + Product Master.
Party Name = Unique of Party Name from Product Master."* `_status.sql` row 122.

**The reasoning is one the project had already applied to PRODUCT names and not
to parties.** 0098 took product names from the register rather than the master,
because *"the master is maintained by hand and was short, while the register is
the record of what actually exists"*. A cascade starts by asking **whose machine
is this** — and a party with no machines cannot answer it. Offering one is
offering a dead end: pick it, the product list comes back empty, and nothing on
screen says why.

**It also closes the case-mismatch class for good** — the fault behind
"CAPTAIN SAURABH KALIA MEMORIAL KAYDEE HOSPITAL has products, this party
doesn't" (2026-09-09). The name you pick now comes from the SAME COLUMN the
machines are looked up by, so it matches by construction rather than by the
`ilike` that was papering over it.

**`product_party_names` (0160)** does the DISTINCT in Postgres — one request
against 1,400 parties in **9.8 ms**, where the client helper paged the whole
table 1,000 rows at a time: **21 round trips every time a form opened**. It
carries the machine COUNT, which the picker shows on the label and never in the
value — it answers the only question a reader has when two similar names are on
screen.

**INSTALLATION IS THE EXCEPTION, and it has to be**: an installation reaches a
customer who has no machine yet, so the product register cannot find them at
all. There, owners are listed FIRST, the Party Master follows behind them, and
free text is allowed. Driven by `config.callType` rather than hard-coded per
screen, so the three registers share one rule. On every other call type the
party must own a machine, because that name is what the products and serials are
found by.

**Owners first, extras behind — not merged.** On every call type but an
installation the owners are the only names that can be the answer, so a name
that will not cascade is never the first thing under the cursor.

**And the call forms' party field stopped being a datalist.** It was the form
engine's `datalist`, capped at 1,000 and re-rendered per keystroke — the same
fault fixed on the call request at v0.9.188 and explicitly left alone then as
"a decision rather than a fix". Changing the source made the decision: with the
list now meaning *parties that own a machine*, free-typing one on a field call
is not an answer, so the field became a picker and the perf fault went with it.

**A form is never left with an empty picker**: `listMaster('productParty')`
falls back to the Party Master if the view is not applied yet, so this is safe to
merge before the SQL is run.

<https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/performance.sql>

**THIRD assertion this session to fail for pinning an implementation detail** —
`options={partyMaster.values}` broke the moment the installation fallback made it
a ternary. Rewritten to test the property. Worth treating as a rule now: assert
what the code MUST DO, never the shape it currently does it in.

⚠️ **PENDING: `performance.sql`** (2026-09-10, v0.9.189) — **THE KPI EXPORT WAS
TIMING OUT FOR ANYONE WHO IS NOT AN ADMINISTRATOR.** Reported: *"Sivarani is
unable to download KPI Report"*, `canceling statement due to statement timeout`
on a range holding 455 calls. `_status.sql` row 121.
<https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/performance.sql>

**The measurement is the point, and it is why nothing caught this.** On a
database seeded to the live shape — 24,000 calls, 55,000 visits, 12,000 spare
requests — one month of the export:

| | |
| --- | --- |
| as **superuser** (RLS bypassed) | **160 ms** |
| as a signed-in **Hotline engineer** | **27,273 ms** |
| after the fix, same Hotline engineer | **618 ms** |

**A 170× gap between the owner and a user.** Every check ever run against this
view ran as the owner, so it looked fine from here and failed for everyone who
actually uses it. Worth treating as a standing lesson: a performance check that
does not `set role authenticated` is not a performance check.

**Why it was slow.** The view pre-aggregated the WHOLE of `reports` and
`spare_requests` into four CTEs, then joined them to the calls. Those CTEs do
not depend on which calls were asked for, so the date range **could not be
pushed into them** — 455 calls still scanned 55,000 visits, three times.

Under RLS that is not merely 55,000 rows. `reports_read` carries
`exists (select 1 from calls c where c.ucn = reports.ucn …)`, and `calls` is
itself a VIEW over three RLS-protected tables — so the entire call-visibility
stack was re-evaluated **per report row**. The plan came back with over a hundred
nested SubPlans.

**The fix is to correlate.** The four aggregates became LATERAL lookups keyed on
the call in hand, so the range narrows the calls first and only those calls touch
`reports` at all. Semantics preserved line by line — including that `latest` is
the latest ENTRY and not the latest visit (0032), and that an empty ucn matches
no spare request.

**Proved identical, not assumed:** every column of every row, old view against
new, across all 24,000 calls — **zero differences**. A KPI figure that quietly
changed would be worse than a slow one.

**A mistake worth keeping written down.** The first index was
`spare_requests (ucn) where coalesce(btrim(ucn),'') <> ''`, mirroring the guard
in the lateral. But that guard is about the OUTER row, so Postgres could not
prove the partial index applied and ignored it — a sequential scan per call,
1.2 ms × 920 calls, more than half of what was left. **A partial index is usable
only when its predicate follows from the query's own restriction on that table.**
Plain index: 2,034 ms → 618 ms. `check:ui` now refuses a partial one here.

**Still slow, and honestly so: "Whole register".** 15.8 s at 24,000 calls,
because it genuinely must compute every call, and the sort is on an expression
over a UNION so no index can order it. That is not a regression — the old shape
was 17.4 s on the same data. Exporting by date range is the answer; making whole
-register fast needs keyset paging or a materialised table, which is a decision
rather than a fix.

</details>

🐞 **"IT IS TAKING A VERY LONG TIME TO ACCEPT THE PARTY" — two faults, one
cause** (2026-09-10, v0.9.188).

**FIRST, WHAT IT WAS NOT.** The obvious suspect was the case-insensitive party
match added on 2026-09-09 (`ilike` where it had been `eq`, to fix the
CAPTAIN SAURABH KALIA spelling), because 0052's own comment warns that a trigram
index does not serve `=`. Measured against a database seeded to the live shape
(21,000 products, ~1,400 parties): `ilike` **1.20 ms** on
`products_party_name_trgm`, `eq` **0.048 ms** on `products_party_name_eq`. Slower,
yes — and nowhere near a stall. **The comment claiming the trigram index serves
the ilike was correct.** Worth recording, because it is exactly the plausible
answer that would have been shipped as a fix and changed nothing.

**WHAT IT ACTUALLY WAS, both in the same field:**

1. **A datalist of up to EIGHT THOUSAND options, re-rendered on every
   keystroke.** The Party box was `<input list="dl-party">` with
   `partyMaster.values.slice(0, 8000)` behind it, and `value` is state — so each
   character rebuilt eight thousand `<option>` nodes.
2. **The products cascade fired PER CHARACTER.** The effect keys on
   `f.partyName`, and the old `onChange` set it on every keystroke. Typing a
   party name therefore sent one products query per letter — each an `ilike`
   over the whole products table with `select('*')` — and the list you ended up
   with was whichever response happened to land last. That is the "impacting on
   listing the products" half, and it is a correctness bug as much as a speed
   one.

**Both are cured by the same control.** The field is now a `PickList`, which
commits ONCE on a click or Enter — so the cascade runs once, with the finished
name. It is also the app's own design default for a dropdown, which this field
had been missed out of. Free text is allowed only for an INSTALLATION, where the
customer may genuinely be new; on other call types the machines are looked up BY
the party, so a typed name matches nothing.

**And a third thing found on the way: `PickList` rendered one button per match.**
Opening the party list built thousands of DOM nodes before the menu appeared.
It now renders 200 and the footer says how many matched and that there are more —
the count stays the TRUE total, only the rendering is capped, and a reader who
cannot see their party learns the answer is "keep typing" rather than "they are
not on the master". Every dropdown in the app opens faster for it.

**Not touched, and worth knowing:** the Field Call / PM / Installation forms use
the form engine's own `datalist` for the party, capped at 1,000 — the same shape
of fault, an eighth of the size. Left alone because the report named the call
request and turning those into pickers changes whether a party can be typed on
three more screens, which is a decision rather than a fix.

**One assertion had to be rewritten rather than satisfied.** `check:ui` pinned
`matches[hi]` verbatim; capping the rendered list moved the highlight to
`shown[hi]` — identical behaviour, failing assertion. It now tests the property
(Enter commits a row from the visible list, and reaches the free-text fallback
only after) instead of the variable's name. Second time this session an
assertion has failed for pinning an implementation detail.

🐞 **FOUR THINGS REPORTED AFTER v0.9.184, and what each turned out to be**
(2026-09-09, v0.9.185).

**1. "Why was supporting document removed from CALLS?" — it was NOT removed, and
that is the bug.** The component is still rendered on the call view and the only
change it took was a debounce. What it did was `return null` whenever no manual
and no article matched — and a panel that is *sometimes absent* cannot be told
from one that is broken. The silence was a deliberate choice ("an empty panel on
every call would be noise") and it was the wrong one: nobody can learn from an
absence that the answer is "no manual is filed for this machine yet". It now
renders either way and says which of the two it is, disappearing only where the
call names no product, complaint or reported problem at all — then there is
genuinely no question to answer. **`check:ui` now refuses a version that can
vanish.**

**2. "Where is it in Registration request view? for the submitted calls?" — a
real miss.** Supporting documents reached the NEW-request form and the Pending
Registrations pane, but not the drawer that shows a request already SUBMITTED —
which is the one somebody opens days later to ask what happened to it. Added,
and `check:ui` counts the usages so a third place cannot be forgotten the same
way.

**3. "Why did the knowledge base not move up (before Service calls)?"** — it was
left where "Help" had been, at the bottom, which is where you put something
people are assumed to already know. It is now above Service Calls: it is read
BEFORE the work, not after it. Asserted by POSITION in `Layout.tsx`, which is the
order the menu renders.

✅ **4. THE FLASHING HEADING NOW EXISTS** (v0.9.186). The user, after the finding
below: *"can u make a heading flash??"* — so the Knowledge Base heading flashes.

**The design is the STOPPING, not the flashing.** A heading that flashes for ever
is not a signal, it is wallpaper: people stop seeing it within a day and it has
cost them attention for nothing. So there are two independent stops — six flashes
over about five seconds and it rests, and opening ANY page in the group ends it
for good on that device (`rithi.nav.seen` in localStorage, every access guarded).
Clicking the heading itself does NOT count: expanding a group is not the same as
having gone and looked, and a nudge a stray click switches off has not done its
job. `check:ui` refuses an `infinite` animation and a version that never marks
itself seen.

⚠️ **THE FIRST VERSION INVERTED AGAINST THE PAGE, AND THAT WAS WRONG — fixed in
v0.9.187 after the user: "flashing has to be a contrast colour".** Not a matter
of taste. "Highlight by inverting" uses `--text` on `--surface`, which are the
PAGE's tokens — and this heading is not on the page, it is in the **SIDEBAR**,
which carries its own palette. `--text` is a near-black and the sidebar ground is
a deep blue (#1f3559 in ALMS). A near-black box on a deep-blue ground is barely a
change: **the standing rule was applied with the wrong pair of tokens**, so the
flash hardly showed. Worth remembering as its own trap — the invert rule assumes
the page's ground, and the sidebar is the one place in this app that has another.

**It is now a fixed, saturated colour** — the OTHER half of the same rule, and
the half that fits here. Amber, because all eight sidebar themes are DARK grounds
(deep blue, teal, clinical blue, emerald, violet, sunset brown and two
near-blacks), so one warm bright colour contrasts with every one of them. A
literal rather than a token on purpose: a token would have to be defined eight
times to say the same thing, and the day somebody adds a LIGHT sidebar theme is
the day this needs revisiting — which a literal makes obvious and a token would
hide. Deliberately **none of the four call-status hues**, which are a code people
have learned to read; `check:ui` refuses those and refuses the page-token invert
coming back.

**And `prefers-reduced-motion` gets a steady marker rather than nothing.**
Repeated luminance change is exactly what some people cannot have; dropping the
signal for those readers would be the lazy reading of that setting, so it becomes
an inset bar in the SAME colour that says the same thing without moving — a
fallback in a different colour would be a second thing to learn for no reason.

**4 (as first reported). "Where is the blinking feature for knowledge base?" — it
had never existed in this repository.** `git log -S"blink"` across all of `src/` returns nothing,
and no changelog entry mentions one. The nearest thing that does exist is the
**jump-strip highlight** on the guide: clicking a task in the strip scrolls to it
and rings that section for 1.6 seconds (`.kb-jumped`, a 2px outline). That
survived the split and now lives on **How to Use RITHI CRM** — it went with the
guide, so it is no longer on the Field Solutions page, which may be where it was
looked for. **Not invented as a fix**: if a blinking or attention marker on the
nav entry is wanted, it needs saying what should make it blink and when it should
stop.

✅ **INDOOR SERVICE PHASE 1 IS LIVE — VERIFIED (2026-09-09).** The user ran
`indoor.sql` and pasted the `_status.sql` output: **row 120 reads `yes`**.

**And it is the PROPERTY that passed, not the presence.** That row reads NO if
`indoor_job_list` has lost `security_invoker` (a workshop register reading as its
owner hands every signed-in user every job), if either guard trigger is missing
(so `indoor.qc`, `indoor.dispatch` and `indoor.condemn` would be hidden buttons
rather than rights), or if the decontamination gate on harvested parts is gone.
A register with the tables and neither guard looks identical on screen — which is
why the row was written to test the guards and not the tables. All of it is
there.

So the workshop register works as designed: the separated rights are refused by
the database, nothing is harvested from a unit that has not been decontaminated,
and a machine cannot leave with a failed check.

⚠️ **`tracker.sql` IS STILL NOT RUN — row 119 read `NO` again on 2026-09-10.**
See the note above. What follows is why that row exists, and it has now proved
itself twice.

**As at 2026-09-09 it read NO**, and it was the only NO
in the whole 129-row report.

**That row earned itself on its first outing.** It was added the day before
precisely because a SEED leaves no table, policy, function or view behind, so a
bundle that had never been run was indistinguishable from one that had — every
other row in the report tests an object, and rows are not objects. Without it
this bundle would have gone on reading as applied, and the six open points would
simply never have appeared on the Tracker with nothing to say why.
<https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/tracker.sql>

**Everything else in the report reads `yes`**, including two that had been
expected to stay NO and are now settled: **pg_cron is enabled** (Review 2
auto-answers on the 03:45 UTC schedule rather than only when somebody opens the
Daily Call Review), and the opening-stock check is clean.

<details><summary>What it applied</summary>

**INDOOR SERVICE PHASE 1
IS BUILT.** 0158 creates the workshop register: `indoor_jobs` carrying both axes
and all six activities' field sets, `indoor_job_accessories`,
`indoor_job_parts`, `indoor_job_checks`, the `IND<YY>-<NNNN>` series, five
permissions and two guard triggers. Until it runs, the page is in the menu for
nobody and `_status.sql` row 120 reads NO. Read it:
<https://github.com/neurolooom-eng/RITHI_CRM/blob/main/supabase/apply/indoor.sql> ·
copy it:
<https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/indoor.sql>

**Two axes, and keeping them apart is the decision the whole shape rests on.**
`kind` says WHOSE PROPERTY the unit is — which is what turns the custody duties
of §7.5.10 on or off, and is why the procedure gives DEMO units a different tag
(4.5.5). `activity` says WHAT IS BEING DONE to it. A DEMO unit in for repair is
still a DEMO unit. One field could not carry both without losing an answer, and
`check:ui` now fails a change that folds one into the other.

**The register stands alone; the call is an optional link.** `ucn` is nullable
because 4.5.5 puts DEMO units in here and a DEMO unit has no customer, no
complaint and no call. Had it gone the other way, DEMO units would need a fake
call raised for them.

**Six activities, not Vignesh's four.** Repair is added back because it is what
§4.5 is actually about, and "recycling or rework" is split — he invited it
("choose or creat ur own") — into **Rework** (§8.3.4: a documented instruction,
an adverse-effect assessment, re-verification) and **Salvage** (SR-017:
harvesting from a condemned unit). Calling both by one word would put a
scrapping decision and a repair decision in the same bucket.

**THREE RIGHTS ARE ENFORCED BY A TRIGGER, not by hiding buttons.** `indoor.qc`,
`indoor.dispatch` and `indoor.condemn` are each refused in the database, because
this project has twice shipped a right only the browser tested (0126, 0127). The
test suite proves each one by holding every OTHER right and still being refused.

**`indoor.condemn` is granted to ADMIN alone on apply.** Scrapping a machine —
customer property above all — is a decision somebody makes deliberately, not one
that arrives with the page. That is the safe shape of an unsettled question.

**One hard gate, and it is the only one:** nothing is harvested from a unit that
has not been decontaminated. Everything else in the module records; that one is
a person putting their hands inside a device that has been in a hospital.

**What it deliberately does NOT do.** No column was added to the three call
tables and the `calls` view was NOT rebuilt — `create or replace view` drops
`security_invoker`, which has silently exposed every call to every user three
times here (0040, 0050, 0057). A call is "at Indoor Service" iff it has an open
job, derived. And **a salvaged part is recorded, never credited to hand stock**:
a part entering stock under its normal code is indistinguishable from new, which
would make its condition grade decoration. Open question 7 stays open, and until
it is answered no balance moves.

**Five open questions were settled the REVERSIBLE way** and each is marked in
`docs/INDOOR_SERVICE_PLAN.md`. The one worth restating: QC signed by the person
who did the work is a **warning, not a block** — the procedure does not say it
must be somebody else, both names are recorded, and the screen says so out loud.
Making it a refusal is one line in the trigger; unblocking a workshop that turns
out to have one qualified person is not.

**Phases 2 and 3 are untouched.** Phase 2 is the loop with the call (the
transfer of 4.5.1, the chip on the call, the completion report of 4.5.7); Phase
3 is QC with acceptance criteria, which needs per-product reference measurements
that do not exist as data yet. `indoor_job_checks` already holds the structure —
parameter, expected, measured, verdict, instrument, calibration due — so Phase 3
fills a column rather than reshaping a table. SR-040, SR-041 and SR-042 move to
**Present**; SR-043 to **Partial**, closed in form and not in substance, which
is the whole of SR-006; SR-044 stays Absent and is Phase 2.

</details>

⚠️ **PENDING: `tracker.sql`** (2026-09-09, v0.9.181) — 0157 puts the points open
at the end of the day onto the Tracker: assign the Zoho Migration role, un-park
the auto-apply pipeline, Indoor Service Phase 1 now the activities are settled,
the condemn/salvage decision, the optional party tidy-up, and the pre-existing
unlabelled error in the `spare_bulk_approval` suite. Additive and idempotent by
title; closes nothing.
<https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/tracker.sql>

**A seventh item was removed before the file ever ran.** It was "confirm the
super-admin revocation actually took", and the `_status.sql` output answered it
the same evening. Seeding an answered question as Open puts a job on somebody's
list that is already done; closing it here in SQL would break 0157's own rule
that Done is the reader's judgement and not the database's. So it is simply not
seeded.

**`_status.sql` row 119 now covers this seed**, and it is the first row in that
report that checks ROWS rather than an object. Every other row asks whether a
table, policy, function or view exists — a seed leaves none of those behind, so
until now a bundle that had never been run was indistinguishable from one that
had. 119 counts the six titles, which is also how 0157 decides whether to add
one. It reads `yes` at any status: an item somebody has since marked Done or
Dropped is still on the list, since closing it is the point.

It is written through `query_to_xml` for the same reason row 85 reads `cron.job`
that way — a plain reference to `public.tracker_items` is resolved when the
report is PLANNED, so on a project that has never run `tracker.sql` the whole
129-row report would fail with "relation does not exist" instead of reporting
this one row as NO. That is precisely the project the row is for. Both cases were
run before shipping: a database built without the tracker module reports 129 rows
with the two tracker lines NO, and a fully migrated one reports it `yes` — and
deleting a single seeded title flips it back to NO, so it discriminates.

📌 **The database schema is now DOCUMENTED, and generated** (2026-09-09,
v0.9.181) — `docs/DATABASE_SCHEMA.md`, 2,300 lines: every table and view, each
column's type, default and nullability, keys and relationships both ways,
allowed values with their SOURCE (a CHECK the database enforces, a master list a
person maintains, or a foreign key), and the RLS policies verbatim per table.
Produced by `npm run schema:doc` from a database built out of the migrations —
**re-run it after any migration; never hand-edit it.**

Writing the generator earned its keep before it shipped. Two bugs it found in
its own first draft, both of which would have made the document confidently
wrong: `relrowsecurity::text` renders `true`/`false` rather than the `t`/`f`
psql shows for a raw boolean, so every one of the 61 tables read as **RLS off**;
and 25 policies carry a multi-line `qual`, so line-based parsing reported **170
policies where there are 117**, the extras being fragments of real ones. Both
were caught by comparing the document's own counts against the database rather
than reading it and nodding.

✅ **THE SUPER-ADMIN REVOCATION TOOK — VERIFIED (2026-09-09).** The user pasted
the full `_status.sql` output that evening and **every row reads `yes`**,
including the one that mattered:

* **118 — `mmdev74@gmail.com` is revoked.** It tests BOTH conditions, so a `yes`
  means neither the `app_super_admins` row nor an admin `profiles.role` survived.
  Had `rbac.sql` not reached the database, the app would have gone on hiding the
  super-admin screens from that account while Postgres kept allowing everything
  behind them — agreement between the intention and the interface, disagreement
  with the only layer that enforces it. That is the state nobody notices, and it
  is why this one was not left at "the user said they ran it".
* **117 — Zoho Migration is a read-only clone.** Tests the PROPERTY, not the
  presence of a row: it fails if the role drifted from `technical_support` or
  picked up anything a write policy names. `yes`.
* **114** (0151, the stored role rows) still `yes`.

The distinction this file exists to hold is now closed on this round: it went
from a report to evidence, and the evidence is the database's own answer.

<details><summary>The PENDING notes this replaces</summary>

⚠️ **PENDING: `rbac.sql`** (2026-09-09, v0.9.178) — 0156 revokes
**mmdev74@gmail.com** (`_status.sql` row 118). SUPER ADMIN IS THREE PLACES and
all three change together: `app_super_admins` (what Postgres allows),
`SUPER_ADMINS` in `src/lib/auth.tsx` (what the browser offers — shipped in the
same change, and `check:ui` now compares the two lists), and `profiles.role`,
because `is_admin()` is `role = 'admin'` **OR** the super-admin row, so dropping
only the row can leave an ordinary Admin standing. Downgraded to `engineer` —
the least this codebase can express; there is no "no access" ROLE, and locking
the account out entirely means deactivating the User Master row, which was NOT
assumed. 0156 sits AFTER 0008 in the module, so replaying the bundle re-seeds
and then revokes rather than restoring a super admin.
<https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/rbac.sql>

⚠️ **PENDING: `rbac.sql`** (2026-09-09, v0.9.172) — 0155 adds the **Zoho
Migration** role (`_status.sql` row 117): Technical Support's reach, taken from
that role's STORED row rather than restated, so the two cannot drift; plus the
report and master-list sub-pages spelled out, because Roles & Permissions shows
a row per sub-page. Read-only by what it does not hold. Until it runs the role
exists in the app's dropdown but no login can be given it usefully. Read it:
<https://github.com/neurolooom-eng/RITHI_CRM/blob/main/supabase/apply/rbac.sql> ·
copy it:
<https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/rbac.sql>

⚠️ **PENDING: `rbac.sql`** (2026-09-09, v0.9.160) — 0151 catches the stored role
rows up with the pages (`_status.sql` row 114). Until it runs, **Spare Insights
is invisible to everyone but an administrator**. Read it:
<https://github.com/neurolooom-eng/RITHI_CRM/blob/main/supabase/apply/rbac.sql> ·
copy it:
<https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/rbac.sql>

</details>

🅿️ **PARKED: the auto-apply pipeline** (2026-09-09, user's call: "not working --
Park it to backlog"). It is BUILT and merged; what stopped it is one character
in the connection string, recorded here so nobody re-debugs it from scratch.

**What actually failed** — not the script, and it never reached the database:

```
psql: error: could not translate host name "110@aws-0-ap-south-1.pooler.supabase.com"
```

The database password contains an **`@`**, so psql split the URI at the wrong
place and read `110@aws-0-…` as the hostname. Supabase's own Connect dialog warns
about this: percent-encode special characters (`@` → `%40`, `#` → `%23`,
`/` → `%2F`, `:` → `%3A`). Failing at DNS means **nothing was applied and nothing
half-applied** — the three runs at 10:13–10:21 on 2026-09-09 all died before
connecting.

**To un-park it:** re-encode the password in the secret, then Actions → *Apply
database migrations* → mode `baseline`, `baseline_through`
`0151_module_keys_catch_up.sql`, then mode `apply`. Nothing in the repo needs
changing.

**⚠️ A PASSWORD FRAGMENT REACHED A PUBLIC LOG.** psql echoed the piece it choked
on — the tail of the password — while GitHub's masking showed `SUPABASE_DB_URL`
as `***` and looked like it had covered it. The scrubber now masks the password
in its own right (fixed same day). **The old run logs still contain that
fragment**, and this repository is public: consider resetting the database
password when picking this up, and delete those three workflow runs.

⚠️ **ACTION: add the `SUPABASE_DB_URL` secret** (2026-09-09, v0.9.167) — then
migrations apply themselves on merge and none of the PENDING notes below need a
human with a SQL editor. Supabase → Project Settings → Database → Connection
string → **URI** (the session *pooler* URI if direct connections are refused),
saved at GitHub → Settings → Secrets and variables → Actions as
`SUPABASE_DB_URL`. **Then run the baseline once**: Actions → *Apply database
migrations* → Run workflow → mode `baseline`, with **`baseline_through` set to
`0151_module_keys_catch_up.sql`**. Without it the tool refuses to run, which is
correct rather than a fault.

**The through-point matters and is not optional here.** A plain baseline asserts
the database matches `supabase/migrations/`, and today it does NOT: `0152`,
`0153` and `0154` are merged but not applied. Baselining all of them would
record three changes as done that are not, and they would never be applied —
the ledger claiming the opposite of the truth, which is the failure this file
has twice been bitten by. Through `0151`, those three stay pending and the very
first real run applies them. Verified against a database built to exactly that
state: the constraint dropped, `frequent_failure()` created, the old function
gone, `security_invoker` intact, and a second run a clean no-op.
This credential BYPASSES RLS — it is not the anon key in `src/lib/supabase.ts`,
which is public by design. It must never be committed or printed; the workflow
scrubs it from psql errors.

⚠️ **RESOLVED, and it was mine: the deadlock on `Spare_1.sql`** (2026-09-09) —
`0154` first rebuilt `spare_pending_rm` by DROPPING it, which needs an
`AccessExclusiveLock` and has to wait out every reader, so it deadlocked against
the live app; outside a transaction it also leaves a window where the view is
gone and queries fail outright. `0116` and `0154` now carry the identical full
column list and nothing is dropped — `check:ui` compares them word for word and
fails on either growing a `drop view`.

✅ **`performance.sql` IS APPLIED — VERIFIED (2026-09-09).** Settled by the same
`_status.sql` output as the revocation above. **112** (`unused_spare_report`) and
**113** (`spare_insights` + the Part Master's new fields) both read `yes`, and 113
checks the property rather than the presence — a `spare_insights` that were
SECURITY DEFINER would fail it, because a definer view hands an engineer the whole
company's consumption figures through a dashboard.

✅ **THE TECHNICAL SUPPORT ROLE IS APPLIED — VERIFIED (2026-09-09).**

**Row 111** reads `yes` in the 2026-09-09 output, and it checks the CLAIM rather
than the presence of a row: every module key the admin role holds,
`data.view_all`, `admin.view`, and not one action any write policy asks for. So
the role is genuinely read-only in Postgres, not merely short of buttons.

The `tracker.sql` half of that round (the "You" → "Rithi Admin" rename) has no
row and so is still only reported; `select owner, count(*) from tracker_items
group by 1` shows no "You" if it took. **Row 119 now exists for exactly this
gap** — see the tracker note above.

Nothing further is needed to USE the role: the picker on User Master reads the
same list the matrix does, so **Technical Support** is already in the dropdown.
The Tracker is the same shape — it is usable, and adding the few other people to
it is a tick each on Roles & Permissions.

The round below IS verified — from the user's own `_status.sql` output: **all 119
rows read `yes`**, including row 109 (the consumption report) and, for the first
time, the two that had been expected to stay `NO`:

* **`DCCR: ...at a quarter past nine`** — **pg_cron is enabled.** Review 2 now
  auto-answers on the 03:45 UTC schedule rather than only when somebody opens the
  Daily Call Review. That was the last environment setting outstanding.
* **`performance: JIT is OFF`** — the Hand Stock compile-time fix is applied.

This is the entry to trust: it has the evidence behind it. Every other line in
this file is a note, and this file has twice claimed the opposite of what was
applied.

🧭 **THERE IS NOW AN IN-APP TRACKER** (`/tracker`, Administration, v0.9.144),
and **0144 seeds it with the fifteen open items indexed above** (v0.9.145).

It does not replace this file, and the two must not converge. **This file keeps
the reasoning** — why a rule is the way it is, what was tried, what went wrong,
which claims are evidence and which are notes. **The tracker keeps what is being
worked on now.** Only OPEN items crossed over: copying two hundred settled
entries would bury fifteen live ones, and a list nobody can scan is a list nobody
reads.

⚠️ **They will drift, and that is fine.** Closing an item on the tracker does not
close it here; this index is still the one to update when something is genuinely
finished.

### Waiting on a decision

| | what |
| --- | --- |
| 💰 | **Pro vs splitting projects.** Nine years of history is ~1.25 GB with this indexing; the free tier cannot hold it even split three ways. The recommendation is Pro (8 GB). |
| 🧹 | **REINDEX the fat tables.** Index bloat is real here — `record_audit` holds 8 MB of indexes over 792 kB of rows. Likely 30–60 MB back for no behaviour change. |
| 🩺 | **The two 13485 gaps that rank first**, and they are a pair: post-service verification against acceptance criteria (SR-006 — §7.5.4 asks for it, and "Solved" is a call outcome, not a statement about the device), and tying a measurement to a calibrated instrument (SR-020 — without it a reading does not evidence conformity). The second is only worth building after the first. Cheapest real gain is SR-027, the complaint determination: one controlled field and a reason on a review that already runs daily. |

*One question that used to sit in this index is **answered**: nonconformity, CAPA
and advisory notices live OUTSIDE this system, and the field call register IS the
complaint register (the user, 2026-09-08). It was still listed as open a round
later — recorded here so the index stops asking it. What the answer created is
SR-038 and SR-039, both above.*

#### 🅿️ PARKED, at the user's direction (2026-09-08)

*"Park it in Backlog."* Three decisions, each blocking work that is otherwise
ready to build. **They are not questions to re-ask** — they sit here until
somebody picks one up.

**1 · Frequent Failure — SHIPPED in 0153 (2026-09-09, v0.9.163).** The rule is
the procedure's: two or more failures **including the call under review**, within
**a month**, same equipment **or the same part in the same machine**; window,
threshold and the judgement call below are editable in **Admin Config**. Of the
two questions that had blocked it:

* *Does the same-equipment path still need a matching complaint?* — made a
  **setting**, defaulting to **on**, which is what this system has done since
  0117. Neither reading is quietly imposed.
* *What happens to Review 2 answers already recorded?* — **STILL OPEN, and
  deliberately not decided by the migration.** 0153 does not touch
  `daily_call_review`: nothing is re-opened or re-answered. Calls decided under
  the six-month window keep their answers, so the register now holds judgements
  made under two different rules. Re-reviewing them is an RA/QA decision, not a
  side effect of a migration. **Needs `daily_review.sql` to be run.**

<details><summary>The original entry, for the record</summary>

**1 · Frequent Failure — the rule is settled, the migration is not written.**
The spec is recorded in full in this file (*"Review 2's frequent-failure rule —
SETTLED, not yet built"*): two or more failures **including the call under
review**, within **a month**, same equipment **or the same part in the same
machine**, window and threshold **editable in Admin Config**. Two things stop it
being built:

* **Does the *same equipment* path still require a matching complaint?** The
  user's rule of 2026-09-06 said yes; the written procedure does not mention it.
  A third setting is the cheap answer and matches "editable in Admin Pannel".
* **What happens to Review 2 answers already recorded under the OLD rule?**
  `0124` auto-answers on a schedule, so a new rule re-bases judgements already
  made — including automatic ones stamped `Auto (9:15 am)`. Leave them as
  answered, or re-open them? That is a quality record being restated either way,
  and it needs a decision before a line of SQL.

</details>

**2 · ANNEXURE A — the SLA cannot express the procedure.** `sla_rules` holds ONE
`target_hours` per key; the procedure sets a **cover × criticality × spare
availability** matrix (SR-010). Blocking:

* **Which bucket does CMC fall in?** It is a live cover type here
  (`WGP, OGP, CMC, AMC`) and ANNEXURE A does not mention it at all.
* **Problem criticality and spare availability do not exist as fields on a
  call.** Both have to be captured before a target can key on them — which is a
  change to call registration, not just to the rules table.

Until then, breach highlighting measures against targets the procedure does not
set: `closure` = 5 days where ANNEXURE A says 3, `closure_spare_noncover` = 10
where it says 15, and nothing at all for the four OGP rows.

**3 · Indoor Service — five questions**, all in
[`INDOOR_SERVICE_PLAN.md`](INDOOR_SERVICE_PLAN.md): whether Central Service holds
its own spare stock; whether QC must be done by somebody other than the person
who did the work; whether the SLA clock keeps running while a machine is on the
bench; the job-number series; and who may transfer a call to Indoor. The plan is
written and phased — Phase 1 stands alone and is also what finally makes the
**Indoor Service** heading appear, since a nav group with no pages renders as
nothing.

### Waiting on me

| | what |
| --- | --- |
| 🛠️ | **The reliability export itself.** `reliability_wrr` (WRR-2026 cols 1–14) and the DCCR export (cols 15–67) are both ready; nothing yet writes the file. |
| 🛡️ | **`has_perm()` returns NULL with no signed-in user**, so the bare `if not has_perm(...)` guard never fires. Fixed in the two functions I touched; **15 other migrations still use the bare pattern**. Latent, not exploitable — execute is granted to `authenticated` only. |
| 🔁 | **Review 2 frequent failure — the rule and the code disagree** (spec supplied 2026-09-08, see below). Not changed yet: Review 2 **auto-answers on a schedule** (0124), so altering the rule re-bases how calls were judged. |
| 🏥 | **Indoor Service** — procedure §4.5 supplied 2026-09-08. Requirements written up as SR-040…SR-044 in `ISO13485_SERVICING.md`; the module is not built and the design decisions are listed there. It also unblocks the long-pending *"Add a Heading — Indoor Service"* left-menu group, which needs a page before it can appear at all (`Layout.tsx`: an empty group renders nothing). |
| ⏱️ | **ANNEXURE A is not what the SLA rules say** (SR-010, downgraded from Met). `sla_rules` holds one `target_hours` per key and the procedure sets a cover × criticality × spare-availability matrix; criticality and spare availability are not fields on a call. Every completion target either differs or keys on the wrong dimension. **CMC is not in ANNEXURE A** and is a live cover type. |

### Long-standing

Audit Mode rules · the security migration (D-2/D-3/D-4) · a CI workflow · two
data uploads (77 yearly consumptions, Ownership Transfer) · `engineer_stock`
`security_invoker`.


---

## Review 2's frequent-failure rule — SETTLED, not yet built (2026-09-08)

The procedure (image supplied 2026-09-08) and the user's answers to the two
questions it left open:

> Frequent Failure — **two or more failures within a month**, either the same
> equipment or same spares.
> *"2 or More including the call in question — Maybe make it editable in Admin
> Pannel."* · *"Same Part in same Machine."*

**So the rule is:**

| | Procedure | `0117_frequent_failure.sql` today |
| --- | --- | --- |
| Window | **1 month** | 6 months (`p_months` default 6) |
| Count | **≥ 2 INCLUDING the call under review** — so **one prior failure is enough** | excludes the call and lists priors, so a reviewer sees 1 where the rule counts 2 |
| Match | same **equipment**, **or** the **same part in the same machine** | same product + serial **and** same complaint |
| Settings | window and threshold **editable in Admin Config** | fixed in the function signature |

**Three real differences, and the direction matters.** The window is 6× too wide,
so the register flags failures the procedure would not — which inflates the
frequent-failure count feeding the objectives. The count is off by one against
the rule as stated. And the *same part in the same machine* path **does not exist
at all**; instead the code requires the complaints to match, which the procedure
does not ask for.

**NOT CHANGED YET, deliberately.** `0124_auto_review2.sql` answers Review 2 on a
schedule, so a new rule re-bases judgements already recorded against the old one
— including automatic answers carrying `review2_by = 'Auto (9:15 am)'`. That is a
quality record being restated, and it needs the user's word plus a decision on
whether history is left as answered or re-opened.

**One question still open:** does the *same equipment* path still require the same
complaint? The user's original rule (2026-09-06) said yes; the written procedure
does not mention it. Making it a third setting is the cheap answer and matches
"editable in Admin Pannel".

---

## Reports come through the bridge, so they open for everyone (2026-09-08, v0.9.149)

> "my org doesn't allow anyone with link can view.. is it possible to parse
> through a default user ID and password to open the file?" … "go ahead with
> option 1"

**The answer to the question as asked was no.** Google has no URL form that
takes a password for Drive, sign-in inside an embedded frame is blocked
precisely to stop it, and a credential shipped in a static front end is readable
by anyone who opens the bundle — with every access then attributed to one shared
identity, which for a validated quality system also destroys the audit trail.

**And the round before was wrong on a point of fact.** v0.9.148 claimed an upload
"is shared by the bridge as it is stored, so it can be shown". Under this
organisation's policy `setSharing(ANYONE_WITH_LINK, …)` throws — it is wrapped in
a `catch` for exactly that reason — so a report has only ever opened for somebody
who already had folder access. The claim is corrected in the app's own Version
History rather than quietly edited out.

**What actually works was already deployed.** `DEPLOY.md:25` runs the bridge as
**Execute as: Me**, which is how it writes into the reports folder; so it can
read back out of it. `drivefile` returns the bytes base64 in JSON (ContentService
cannot return arbitrary binary), the app builds a blob and renders that. No
sharing changes, and the reader needs no Google account.

* **`_isAppDocument()` is the guard that must not be relaxed** — it checks the
  file's PARENTS against the app's own folders, never its name. Without it the
  action is a reader for the whole of the deploying account's Drive.
* **It is still an open endpoint**, like the rest of the bridge: whoever has the
  `/exec` URL and a file id can fetch one. That is, in effect, the link-sharing
  the domain policy forbids, reached from another direction — a decision for the
  system's owner, and `DEPLOY.md` now says so and names the `ACCESS_TOKEN` script
  property that closes it.
* Its own 60-second timeout, not `getJson`'s 8: that helper aborts and retries
  over JSONP, which is right for a one-line answer and would fetch a
  multi-megabyte document twice.
* The blob URL is revoked on close — it is a live handle into the tab's memory.
* Drive's own preview stays as the FALLBACK and **says why it fell back**, so
  "it showed me something else" is not the only report anybody can make.

Untestable from here as before (`script.google.com` is blocked from the sandbox);
seven new assertions pin the guard, the ceiling, the ordering and the cleanup.

---

## Reports open in the app, and are uploaded rather than linked (2026-09-08, v0.9.148)

> "is it possible to render the reports -- those saved in drive directly in app?
> instead of going to drive?" … "most of it are uploaded.. or rather has to be
> uploaded - pasting link shouldnt be an option"

**The two halves depend on each other.** Drive has one supported embed endpoint,
`/preview`, and whether it renders is decided by the file's SHARING, not by the
URL. `CallReg.gs:494` sets `ANYONE_WITH_LINK / VIEW` on every file it uploads
(and line 568 on every AppSheet-era file it resolves) — so an uploaded report can
be shown. A link somebody pasted points at whatever they had open, usually a file
in their own Drive; that renders Google's "you need access" page INSIDE the
frame, and because the frame is cross-origin **JavaScript cannot tell that it
did** — no error, no callback, nothing to react to.

So removing the paste box is not tidying: it is what makes the viewer
trustworthy. And because a failure is undetectable, **"Open in Drive" is
permanent on every preview**, never a fallback offered when something goes wrong.

* `src/lib/drive.ts` — one parser, `drivePreviewUrl()`. Handles `/file/d/<id>/`,
  `open?id=`, `uc?id=`, and the three editors (a Doc served from
  `drive.google.com/file/…/preview` renders nothing; each previews under its own
  path). **An unknown link returns `''` and opens in a tab exactly as before** —
  historical rows point at all sorts of things and none should stop working.
* `src/components/doc/DocPreview.tsx` — one viewer, four screens (closed call,
  visit history, Daily Call Review, visit entry — the last also shows the
  PREVIOUS visit's report).
* `CallReporting` — the Manual Report is a file picker, the shape
  `DriveFileField` already uses on the registration documents.

**NO `sandbox` ATTRIBUTE ON THE FRAME, deliberately.** It reads like the safer
choice and is the opposite of one: without `allow-same-origin` the framed page
gets an opaque origin and Drive's viewer loses the cookies it needs to
authenticate the reader — the preview would fail for exactly the files a
signed-in person is entitled to see. The frame is cross-origin either way, which
is what actually stops it touching the app.

**Untested from here, and it is the one thing that can only be tested live:**
`script.google.com` is blocked from this sandbox, and a Drive embed depends on
the viewer's own Google session in any case. Nine unit assertions pin the URL
building; whether Drive frames a given file is Drive's answer to give.

Service manuals and QMS documents keep their paste option — a manual is often a
manufacturer's page on the internet, and the Document Library already says so on
the row ("Linked, not stored").


---

## The service report, one click from a closed call (2026-09-08, v0.9.147)

> "in call - for closed calls add the service report ( Manual report) as a
> clickable link"

Two places, because a report belongs to a VISIT and a call can have several:

* **At the top of a closed call**, beside the 🔒 Closed marker — the latest
  visit that actually filed one, labelled with that visit's date. A call closed,
  re-opened and closed again has a later visit with nothing attached, so taking
  "the last visit" would show nothing and say, untruthfully, that no report was
  ever filed.
* **In the call's visit history**, a column per visit. The cell stops the click
  propagating, so opening the report is not also opening the visit behind it.

**Fetched when the call is opened, not carried on the row.** The call tables
denormalise the last visit's status and date (0014/0032) and nothing else.
Widening that would mean a column on three call tables, the trigger, and a
rebuild of the `calls` view — and `create or replace view` there is the change
that has dropped `security_invoker` three times in this project. One request per
call opened, only for a closed one, is the cheaper side of that trade by a
distance. **No SQL: nothing to run.**

**One reader, `manualReportLink()`.** The field is written in two places on the
same row — `reports.manual_report` and `data['Manual Report']` — and three
screens each had their own coalesce. The Daily Call Review's checked neither the
legacy key nor whether the value was a URL, so a row where somebody typed a note
rendered as a link to nowhere. Six unit assertions in `check:ui` pin the reader.

**One class, `.svc-report-link`,** moved from `dccr.css` to `styles.css` so the
same document cannot look like a chip on one screen and faint text on another.
It is contrast, not tint — the standing rule. `dccr.css` keeps only where it
sits on that screen.


---

## Technical Support — the Super Admin's reach, none of its writes (2026-09-08, v0.9.146)

> "Create a New Role 'Technical Support' - Map this Role to All Modules and
> Mimic Super Admin - But with Read Only For now."

`0145_technical_support_role.sql`. The role holds **every module key the admin
role holds** — the administration pages included — plus `data.view_all` so the
call pages are not empty, and **only actions that read**.

**What makes it read-only is what it does not hold**, not a flag. Every write in
this database is gated by a policy naming the action it needs, so the refusal is
Postgres's: `supabase/tests/technical_support_test.sql` proves it by refusal, not
by reading the permission list — a master, a call, a role and a profile are all
turned down under `set role authenticated`.

**Two exceptions, both by earlier design, and both tested rather than hidden:**

* **`tracker_items`** — `tracker_rw` (0143) is ONE permission for view and edit,
  which is exactly what was asked for on that page. Holding `mod:/tracker` is
  therefore holding the right to add and edit there.
* **`feedback`** — `fb_write` (0008) accepts `feedback.view`, which is also what
  reads the page, so the two cannot be separated without changing that policy for
  every role that holds it (nsm, rm, rgm, tally, commercial).

Untick the module, or the action, for this role to close either. A catalog query
in the test suite finds any THIRD table of this shape the day one appears.

**`admin.view` is new** — it opens the administration screens read-only. They
gated themselves on `users.manage` / `rbac.manage`, the rights to CHANGE what is
on them, so until now there was no way to let somebody look. User Access,
Settings (both connection panels) and Roles & Permissions all open with it and
keep their own right for everything that writes. The nav's `adminOnly` test moved
into one helper, `navItemVisible`, so the rule is in one place.

**Also: the Tracker says "Rithi Admin" where it said "You"** (the user's ask the
same day). On a shared list "You" is the one word that means somebody different
to every reader. `0144` renames rows already out there, narrowly — the exact
word, in the one column it was wrong in.

Verified on a throwaway Postgres: every migration applied, the suite run twice,
`check:replay` (21 bundles), `check:views`, `check:bundles`, `check:ui`,
`npm run build`.

---

## 🚧 In progress

### The UCN counter restarts daily — 2026-09-06 (shipped, NOT yet applied)

Asked: "why is the UCN not resetting the last 2 digits on a daily basis?"

Because nothing ever reset it. `next_ucn()` took the last four digits from
`ucn_seq`, ONE sequence for the whole database, created in 0001 and never reset
— so the date in front changed daily and the number behind it climbed forever,
shared across all three call types. Not a regression: 0001's own comment said
"confirm this matches the legacy format before go-live", and
`docs/SUPABASE_MIGRATION.md` carried "whether the sequence should reset per
day/month" as an open item from the beginning. Now settled there.

The register is the evidence: it holds `26H28F0009` then `26H29F0003`, and a
monotonic counter cannot go down. The sheet reset daily; the database did not.

**0125** replaces the sequence with `ucn_counters` (day, type_letter, last_no):
- restarts at 0001 each day, **per call type** (user's choice) — the type letter
  is already in the UCN so nothing collides, and a Field register that counts
  1, 2, 3 is the one that reads properly on paper;
- **numbers already issued are untouched** (user's choice). A day's counter is
  SEEDED past whatever that day already carries, so applying it mid-day
  continues the day rather than colliding with a UCN already on a challan;
- ⚠️ **and the day is now Asia/Kolkata.** `next_ucn()` read `now()` in UTC, so
  the DD inside a UCN rolled at **5:30 am IST** — a call registered before then
  already carried yesterday's date. A daily reset on that clock would have reset
  at 5:30 too, so both are fixed together.

`ucn_seq` is dropped. `_reset_for_production.sql` truncates `ucn_counters`
instead of resetting it, and `_backup_before_reset.sql` snapshots that table and
no longer lists the sequence.

**To run:** `supabase/apply/call_requests.sql` — `_status.sql` row 86.


### Bundle replay safety — 2026-09-06 (shipped, NOT yet applied)

`_status.sql` came back with six policy rows at NO after the user ran
`rbac.sql`. Same fault as the `srl_insert` one the day before: a bundle carries
its module from the beginning, so a rule written early and narrowed later goes
BACK when the earlier bundle is re-run. It was measured rather than reasoned
about — every migration applied to one database, each bundle replayed onto a
copy, and every policy, function and view diffed. **Six bundles** were reverting
something. All six are fixed and `npm run check:replay` now passes on all 19.

- **Guarded mirrors.** Where the object could not be moved into the bundle that
  owns the last word, the module now ends with a verbatim copy of the owner's
  definition, skipped while the later module's tables are absent:
  `0121_rbac_policy_tail` (6 policies + the per-stage approval guard),
  `0122_spare_requests_replay_tail` (`dispatch_spare_lines`, two overloads, and
  `sd_read`), `0122_stock_transfer_replay_tail` (`engineer_stock`, `st_read`,
  the transfer stock guard), `0122_notifications_replay_tail`, and
  `0122_user_directory_replay_tail` (drops `ud_admin_write` again).
- **`base.sql` refuses** to run where `app_roles` exists. Mirroring its 29
  later-narrowed objects would have been worse than saying no. Bootstrap is
  unaffected; anywhere else, `all.sql` is the answer.
- **`npm run check:replay`** (new) is the proof, and the only check that can see
  `masters_write` — 0008 creates it through `execute format()`, so no
  `create policy` literal exists for a text check to find.
- **`npm run check:bundles`** grew a MIRRORS list: a mirror must be LAST in its
  module and must match the migration it copies word for word.

⚠️ **Two real faults it turned up on the way:**

1. **The refurbished-part notice has never been sent.** 0064 extends
   `notify_spare_dispatched()` to say the dispatched part is refurbished, but
   `notifications` runs AFTER `handstock` in `ALL_ORDER`, so 0054's version
   overwrote it on every apply. `_status.sql` row 81 reports it.
2. **The per-stage approval guard is currently back at 0008's version on the
   live project** — the `rbac.sql` run that produced the six NOs did that too,
   and 0008's guard refuses an engineer acknowledging receipt. `_status.sql`
   row 82 reports it. Running the new `rbac.sql` repairs it.

**To run on the live project, in any order (that is now the point):**
`rbac.sql`, then `notifications.sql`. Verified from a database rebuilt into the
exact state the user reported: the two together clear all nine NO rows.

**Not fixed, recorded:** `engineer_stock` has no `security_invoker` while the
`handstock_balance` it reads does. `check:views` does not flag it because the
view is not directly over an RLS table, and the read scope is untested. Worth
its own change — see the `create or replace view` note in CLAUDE.md for why an
invoker view over an owner-run one is not protection.


### Applied on the live project — 2026-09-01
Run and confirmed by the user, in this order:
- **`stock_out_lines_and_refurb.sql`** (0064–0065, applied 2026-09-02) — Stock
  outs became a FLAT list (`spare_stock_out_lines`, one row per spare issued)
  carrying **days to dispatch**, measured from the last approval (NSM where the
  item needs that review, else Commercial, else RM) to the stock out.
  **Refurbished spares:** Stores may issue the recycled equivalent (R + part
  code, description unchanged); hand stock is now derived from the ISSUE, so the
  R-part is held and consumed as its own stock line. The swap is refused unless
  the R-code is in Part Master AND active. The engineer's notification says the
  part is refurbished.
  ⚠️ **Operational:** the R-codes must be added to Part Master as ACTIVE before
  Stores can issue them.
- **`consumption_reconciliation.sql`** (0059–0063, applied 2026-09-02) — the
  spare reconciliation set:
  * **Book** a missed spare against a call (RECO on any call row / its drawer,
    for Spare Coordinator, Hotline, Admin). Parts come from that engineer's hand
    stock; several at once; UCN, engineer, part and reason all required.
  * **Adjust** a wrongly reported quantity; **void** an entry made in error by
    setting it to 0 (deletes stay blocked — the line keeps `was N`, the reason
    and who changed it, and the spare returns to hand stock).
  * **Cap:** no consumption line, reported or hand-booked, may exceed the
    engineer's hand stock. A refused report tells the engineer to ask the Spare
    Coordinator, so control of the balance sits with the coordinator.
  * Identity (call, part, engineer, source) can never be changed by an
    adjustment — to move a line, void it and book the right one.
- Live state CONFIRMED with `supabase/apply/_state_check.sql`: split applied,
  0041 hardening applied (3 CHECK constraints), reg_at/added_on present,
  37 trigram + 8 btree search indexes, partial dispatch + per-shipment receipt,
  call re-open. **Run that script before assuming anything is or isn't applied**
  — twice today a stale note sent us at the wrong problem.
- **`search_indexes.sql` (re-run)** — the first run had created only the 37
  trigram indexes; the re-run added the 8 btree (`_eq`) ones that serve the
  exact-match / IN lookups (products by party for the request cascade, calls by
  serial for "open calls"). A trigram index cannot serve `=`/`IN`.
- **`pm_schedule_fields.sql`** (0050) — `reg_at` + `added_on`.
- **`harden_call_split.sql`** (0041) — per-table CHECK so a call can never be
  filed under the wrong type.
- **`partial_dispatch.sql`** (0055) — Stores can send fewer units than were
  requested; the line stays queued for its remainder. `dispatched_qty` on the
  line, a `spare_dispatch_lines` table (a line can span several stock outs),
  existing dispatches back-filled, `spare_pending_dispatch.qty` = the REMAINDER,
  hand stock counts what was dispatched, `dispatch_spare_lines(..., p_qtys)`
  rejects over-sending.
- **`receive_per_shipment.sql`** (0056) — the engineer acknowledges each delivery
  as it lands (`received_qty` on the line, receipt stamps per shipment,
  `receive_spare_shipments()`); the line only turns **Received** once every unit
  is confirmed, so the stage logic is unchanged.
- **`help_screenshots.sql`** (0043, knowledge_base) — the guide's per-task
  screenshots. Admins can now add/replace/remove a picture on each step of
  "How to use RITHI CRM"; everyone else sees them.
- **`notify_uid_fix.sql`** (0054) — `notify_spare_dispatched()` declared a plpgsql
  variable `uid` that clashed with `spare_requests.uid`, so the trigger aborted the
  UPDATE Pending Dispatch runs: **nobody could book a spare out** ("column
  reference \"uid\" is ambiguous"). Variable renamed to `v_uid`, column qualified;
  same rename in `notify_call_allotted()`. Reproduced and fixed on PG16.
- **`fix_roles.sql`** — one-shot role/visibility reconciliation: merges the
  baseline permissions into `app_roles` for all nine roles (merge, so admin edits
  survive), re-asserts `can_view_all_calls()` / `can_see_call()`, and folds the
  office-role bypass into the read policies for the call registers (select +
  update), `reports`, **`call_requests`** and `pending_registrations`.
  ⚠️ The Pending Registrations screen reads **`call_requests`** (via
  `listCallRequestsAsPending`), *not* `pending_registrations` — two earlier fixes
  targeted the wrong table. `cr_read` (0003) had no office bypass at all, which is
  why Hotline saw only her own request. Now 0053.
- **`search_indexes.sql`** (0052) — pg_trgm trigram indexes for substring ILIKE
  search *and* plain btree indexes for the `=`/`IN` lookups (products by party for
  the request cascade, calls by serial for "open calls"). Fixes "canceling
  statement due to statement timeout" on Search, on Create-New-Call prepare, and
  the empty product list when picking a party.

**Note for future visibility work:** a role seeing "nothing" is usually the
`has_perm('calls.view') AND <scope>` gate — `has_perm` only falls back to the
engineer defaults when the role's `app_roles` row has ZERO permissions, so a row
with *some* permissions but missing `calls.view` silently blocks everything.

### Calls table split (3 physical tables) — ✅ APPLIED LIVE (confirmed 2026-09-01)
`calls` is a VIEW over `field_calls` / `installation_calls` / `pm_calls` on the
live project — verified with `check_db_state.sql`. The "SQL to run" notes below
were STALE: `0044_daily_call_review.sql` cannot even run without `field_calls`,
so the split necessarily went in with the Daily Call Review work.
**Do not run `split_call_tables.sql` again.** Stage 3 hardening (0041) has since
been applied too.

- **Stage 1 — DB (applied):** `0040_call_tables_split.sql` splits
  `calls` into `field_calls` / `installation_calls` / `pm_calls`. `calls`
  becomes a UNION view with INSTEAD OF routing triggers, so the app is
  unchanged; `pending_calls` / `call_state` rebuilt over the union; RLS + the
  UCN/call-number/last-visit machinery live per table; UCN letters now F/I/P
  (PM detection fixed). Validated on PG16 (fresh apply, idempotent, routing +
  returned UCN, RLS scoping, report sync, call-registration suite).
  ✅ Applied (see above).
- **Stage 2 — client (shipped, v0.8.41):** `listCalls`/`searchCalls` read the
  typed table via `callTable()`, so each register (esp. PM) is isolated;
  cross-type screens keep the view.
- **Stage 3 — hardening (built, SQL to run):** `0041_call_split_hardening.sql`
  adds a per-table CHECK (`call_table_for(call_type)`), so a row can never be
  misfiled, and drops the redundant per-table call_type index. `calls` view
  kept (recommended). ✅ Applied live (2026-09-01).
- Related (all shipped): PM bulk upload (v0.8.46), Commercial-gated Installation
  creation (v0.8.47), SLA rules engine (v0.8.49), notification bell (v0.8.50).

### PM Bulk Upload — due month + registration date & time (shipped v0.8.58, SQL to run)
- Every uploaded PM row is dated the **1st of a chosen due month** (a
  `<input type="month">` picker, defaulting to the current month — pick a past
  month to **backfill older calls**). Today's date is captured as **Added On**.
- **Numbering is unchanged** (UCN + Call Number as before). What orders a batch
  is a new **registration date-and-time** (`reg_at`): each call a few seconds
  apart — **00:30 on the 1st, 5s apart** for a fresh month, or **10s after the
  latest existing call** when adding to a month that already has some — and the
  **start time + gap are editable** before import. `reg_date` stays a plain date
  so every date-based view/index keeps working.
- `0050_pm_schedule_fields.sql` adds `added_on` + `reg_at timestamptz` to the
  three split tables (reg_at back-filled to midnight of reg_date), drops the
  earlier per-month-serial trial, makes `calls_before_insert()` derive
  `reg_date`↔`reg_at`, and rebuilds the `calls`/`pending_calls` views + INSTEAD
  OF routing. Validated on PG16 (fresh-month 00:30+5s, backdated +10s
  continuation, derivation both ways, numbering unchanged).
  ✅ **Applied live (2026-09-01)** — `reg_at` / `added_on` are in place, so PM
  Bulk Upload's due-month + registration date-and-time are now functional.
- **Deferred (feasibility):** auto-generate the monthly PM schedule from Product
  Master (due-date + contract cover per machine) instead of a spreadsheet upload.

### Go-live cutover
Run in this order: **`_backup_before_reset.sql`** → **`_reset_for_production.sql`**
→ (if section 2 was run) **`daily_review.sql`**. `_restore_from_backup.sql` undoes
the reset from the snapshot.
- **`supabase/apply/_backup_before_reset.sql`** — snapshots every table the
  reset empties into a `bak` schema in the same project, and refuses to run
  twice rather than overwriting an older snapshot. It is a fallback for a
  SQL-editor-only cutover, NOT a real backup: it is in the same database, so it
  covers the reset and nothing else. The header carries the `pg_dump` line.
- **`supabase/apply/_restore_from_backup.sql`** — puts the snapshot back. Three
  things it has to get right that a plain `insert … select *` does not, all of
  them found by testing the round trip rather than by reading:
  - every `id` here is **GENERATED ALWAYS**, so the insert needs
    `OVERRIDING SYSTEM VALUE` — without it the restore is refused, and a plain
    insert that dropped the id would silently RENUMBER every row.
  - **GENERATED columns must be excluded** from the column list
    (`field_calls.open_state`, `call_reviews.review2_done`/`review3_done`/
    `any_potential_effect`). Listing one fails the whole restore with "cannot
    insert a non-DEFAULT value into column"; they recompute themselves.
  - write triggers are disabled during the restore (they would restamp
    `updated_at` / `created_by`), and every sequence is moved **past** the
    restored ids afterwards or the next real insert collides.
  - Verified: seed → snapshot → reset → restore returns identical ids, UCNs and
    quantities, recomputed `open_state`, and a following insert takes the next
    free id.
- **`supabase/apply/_reset_for_production.sql`** — empties the data produced
  while testing and keeps the people and the setup (`profiles`,
  `user_directory`, `app_roles`, `app_settings`, `sla_rules`, `master_lists`).
  Hand-maintained, NOT generated. Points worth knowing before running it:
  - It uses **TRUNCATE**, not DELETE, because `0049` blocks the application role
    from deleting quality records on purpose. That is also why it is a script
    the user runs in the SQL editor and not anything the app can do.
  - `TRUNCATE ... RESTART IDENTITY` does **not** reach three sequences, because
    they are not owned by the column that uses them: `ucn_seq` (the last four
    digits of every UCN), `call_req_seq` (the REQID) and `call_split_id_seq`
    (0040 made the id shared across field / installation / pm so the `calls`
    union view has unique ids). The script `setval`s them explicitly — without
    that the test run's count stays visible in production UCNs.
  - Clearing `masters` also clears the values **0046 seeded** (DCCR Complaint
    Grouping / Root Cause Key Word). Re-run `daily_review.sql` afterwards, or
    the Daily Call Review's dropdowns come up empty and it does not look like a
    data problem.
  - Verified end to end on a throwaway PG16: after the reset the first call is
    `…F0001` / `CL<yy>00001` / id 1, the first request is `R1`, and the spare
    series restarts at `OR-YYMM-0001`.

### Bulk Report Mapping — recovering lost visit history
- **`/report-mapping`** (admin). A CSV of recovered visits → each matched to its
  call → AppSheet file references resolved to Drive links → written. Nothing is
  written until the operator has SEEN what every row resolved to.
  - **Matched on UCN, then Call Number** — the same two keys and the same
    precedence 0048 uses, so a recovered visit lands where a live one would.
    Deliberately NOT on serial or party: a machine has many calls, so that would
    attach a visit to an arbitrary one. Unmatched and ambiguous rows are held
    back and listed, never guessed at.
  - **AppSheet references** come in three shapes and an export mixes them: a
    `gettablefileurl?...&fileName=` link, the bare `Reports_Images/foo.png`
    path, or something already a Drive link / id. Only the first two need
    resolving and both reduce to a FILE NAME, looked up through a new
    read-only `drivefind` GET action on the bridge (GET, because a GET response
    is readable cross-origin — no ref/poll dance like the uploads). A name
    matching more than one file comes back EMPTY: the wrong photo on a service
    record is worse than none.
  - **`reports.source_ref`** (0071) keeps the original reference next to the
    derived link, so a wrong resolution can be re-run rather than being
    permanent. `mapped_at` marks a visit as recovered, not reported live.
  - ⚠️ **`reports_uid_key` was PARTIAL** (`where uid is not null`, 0002), and
    Postgres will not infer a partial index from `on conflict (uid)` — the
    upsert failed outright until 0071 replaced it with a full unique index
    (NULLs are distinct, so the sheet-era rows with no uid are unaffected).
    That upsert is what makes re-running a sheet CORRECT its rows instead of
    doubling the visit history.
  - Dates are read **day-first** (`03/04/2026` = 3 April). Letting `Date()` read
    an Indian export would silently move a visit by a month.
  - `npm run check:mapping` runs 31 checks over the pure half
    (`scripts/check-report-mapping.ts`) — there is no test runner in this repo.
  - ⚠️ `script.google.com` is blocked from the sandbox, so `drivefind` has NOT
    been exercised end to end. **CallReg.gs must be redeployed** for it to exist.

### Stock levels before the movement history (0074 + 0075)
Hand stock is derived from movements. Raw spare data starts **June 2022**, so
everything before it existed only as balances — and because consumption is
CAPPED at hand stock (0061), an engineer holding pre-2022 stock could not report
fitting it. Two tables fix that, both consolidated as ARMS of
`handstock_movements` so the balance, the movement trail, `engineer_stock`, the
transfer guard and the cap all inherit them untouched:
- **`handstock_opening`** — the opening pools. WinMax HS (struck June 2022) and
  the 22 H2 / 23 / 24 / 25 levels **alongside** it. **Additive, not
  restatements** (confirmed by the user): they sit beside one another and beside
  the movements, and nothing double-counts because there are no movements before
  June 2022. Unique on (engineer, part, source) so re-loading a corrected sheet
  replaces THAT pool.
- **`spare_consumption_history`** — the ~44,000 pre-2026 consumption rows, in
  their own table with **no cap and no reconciliation**. Applying today's cap
  retrospectively would have refused most of the history, silently dropping real
  consumption to satisfy a rule that did not exist when it happened — and the
  cap runs a derivation PER ROW, so 44,000 rows would each aggregate the whole
  movement history. Measured: **44,000 rows insert in 0.9 s**. Reconciliation
  stays on the 2026 entries in `spare_consumption`, which is where the control
  point belongs.
- ⚠️ Both needed a **stored** `source_key` (`lower(btrim(source))`) rather than
  an expression index: `on conflict` cannot infer an expression index, so the
  upload's upsert would have been refused — the same trap the partial
  `reports_uid_key` sprang in 0071. `check:uploads` now verifies every
  register's conflict key is derived from something it fills.

### Consolidation pass (v0.9.40)
- **One date parser** — `src/lib/dates.ts`. coverImport, dataImport, uploads and
  reportMapping each had their own; they had started to disagree (only one read
  space-separated `08 06 2026`). All four now delegate. Behaviour is preserved:
  the cover importer still writes a wall-clock time as if UTC and the others
  still read it as local — `toIsoTimestamp(v, 'local')` everywhere, settled — see below.
- **One header matcher** — `src/lib/headers.ts` (strict → loose → squash).
  Bulk Report Mapping now recognises the same headings Bulk Uploads does
  (`UC Number`, `Visit Date & Time`, `Death?`); it was strict-only.
- **One CSV parser** — `src/lib/csv.ts`.
- **Legacy Data Import trimmed** to what Bulk Uploads does not do: cover
  exports + Normalise, user_directory, MRN two-tab flattening. Seven duplicated
  shapers removed.
- **Dead code removed**: `CrudModule`, `schemas.tsx` (7 of 8 configs were
  never routed), `CallExtras` (wrote consumption to localStorage, bypassing the
  cap — reachable only from the unrouted configs), the `/products` demo route,
  `seedDemoData`, `nextCode`, `partCode`.
- **FFR + KPI** are honest placeholders (they rendered blank from the emptied
  demo collections). Both still need a table — see queued.
- **Two conflicts put to the user and SETTLED 2026-09-03**: (1) imported
  wall-clock timestamps are read as LOCAL time in every importer — the cover
  importer had written them as UTC, putting sale/contract entry times 5½ h off
  for IST; (2) display reads a non-ISO date DAY-FIRST like the imports, so a
  visit's report date is the day the export meant (`parseAnyDate`).

### The 500 MB cap — MEASURE BEFORE SPLITTING (2026-09-07)

The user is at ~450 MB of a 500 MB per-project allowance and asked whether
tables could live in a SECOND Supabase project and still be queried and compared
from here.

**They can, but a second project is a second Postgres database**: no SQL joins
across the two, no shared `auth.uid()`, no shared `has_perm()` / `app_roles`, and
none of the apply bundles, `_status.sql`, `check:replay` or `check:views` can see
across the boundary. That is a permanent architectural cost and worth paying only
if the space is genuinely in use.

**A separate SCHEMA does not help here** — same database, same disk. Schemas buy
separation, not capacity. (It would have been the answer if the reason were
ownership or retention.)

⚠️ **A CHECK FILE MUST BE ONE SQL STATEMENT.** The first cut of
`_storage_check.sql` used `\echo` and `\pset` to label its sections — those are
**psql's own commands**, and the Supabase SQL Editor rejects them with
`syntax error at or near "\"`. Every other `_*_check.sql` here is a single
query returning one labelled result set, and that is why. It is now the same
shape as `_status.sql`.

### The reliability template — it is WRR-2026, not Merge WRR (2026-09-08)

**CORRECTED by the user: "it's not Merge WRR, it is WRR-2026."** The sheet a
person fills is the YEAR sheet; `Merge WRR` consolidates the year sheets and is
downstream. WRR-2026's columns 1-14 are Merge WRR's columns 1-14 heading for
heading, so `reliability_wrr` is right and only its address was wrong.

**WRR-2026 IS TWO EXPORTS SIDE BY SIDE:**

| columns | what | where from |
| --- | --- | --- |
| 1-14 | the reliability fields | `reliability_wrr(product)` (0141) |
| 15-67 | the DCCR | `IMPORTRANGE` from a Google Sheet today |

**`DCCR_EXPORT_COLUMNS` already produces 41 of those 51**, in the same order and
under the same headings. **Ten are missing:**

| col | heading | obtainable? |
| --- | --- | --- |
| 15 | Updated By | ✅ `call_reviews.updated_by` |
| 16 | Updated Date | ✅ `call_reviews.updated_at` |
| 32 | CALL PENDING REASON | ✅ `reports.pending_reason` |
| 67 | DUMMY COLUMN | ✅ a spacer — emit blank |
| 35 | CALL DETAILS | ❓ |
| 36 | VISIT REMARKS | ❓ distinct from "VISIT REMARKS (Reporting)", which IS exported |
| 37 | CHANGE PRODUCT? | ❓ |
| 57 | SEND EMAIL FOR DEFECTIVE SPARE | ❓ |
| 63 | SL NO(T) | ❓ |
| 64 | Complaint | ❓ distinct from Standard Complaint and NATURE OF COMPLAINT |

✅ **ALL TEN ADDED 2026-09-08** ("for now add those columns and leave it blank").
`DCCR_EXPORT_COLUMNS` is now WRR-2026 columns 15-67 **exactly — 53 for 53, in
order**, verified against the workbook itself and locked by `check:ui`.

CALL PENDING REASON is FILLED (the register already carries it). The other nine
are blank: the six ❓ because guessing would put invented values on a quality
record, `Updated By`/`Updated Date` because they live on `call_reviews` but not on
the view this screen reads — filling those is a migration, not a line — and
`DUMMY COLUMN` because it is a spacer.

⏳ **Still wanted: what the six ❓ held.** Two rows from the old AppSheet sheet
would settle it.


The user's `VEGA__French_Template_Reliability.xlsx` is a Weibull study, and only
TWO of its sixteen sheets are typed into — the rest derive:

```
Installed Base = FILTER(Inst_PrdMaster!B:B, Inst_PrdMaster!I:I = <model>)
Services       = FILTER('Merge WRR'!C5:K, ...)
```

So filling **`Inst_PrdMaster`** and **`Merge WRR`** fills the workbook; the age
bands, the Pareto and the Weibull fit recalculate themselves.

**`reliability_wrr(product)` (0141) is the Merge WRR half.** ONE ROW PER VISIT —
a call attended three times is three services in a reliability study, and
counting it once flatters the failure rate. **PM calls are excluded**: the sheet
carries its own "Date of last preventive maintenance" column, which would be
meaningless if a PM were a service row of its own. Installation calls ARE
included — the user's own sample has one.

**The DCCR lines up with the template almost name for name**, which is no
coincidence: `any_potential_effect`, `spare_category` and `root_cause_keyword`
are the template's own headings. `Symptoms` is `complaint_grouping` (the
normalised symptom), not the caller's words — the sample reads "MACHINE NOT
SWITCHING ON" as the reason and "DEVICE NOT GETTING ON" as the symptom, and a
Pareto needs the second.

⚠️ **`any_potential_effect` is a GENERATED column** — YES when any of the three
Review 2 answers is. It cannot be inserted, and that is the point: the template's
column cannot drift from the answers behind it.

**Two readings that are mine**, both one line to change: "Default confirmed" has
no column anywhere and is 'Yes' when a root cause was recorded; "FQI/FRC/FSCA n°"
is always NIL because nothing holds one.

**Nine of the sixteen `Inst_PrdMaster` columns have no column in `products`** —
Item Details Long, Item Details, Sold Through, State, City, Address, Item Code,
PO No., PO Date. The Product Master importer is `extraInto: 'extra'` and keeps
them under the SPREADSHEET'S OWN HEADINGS; 0140 surfaces them as `details` jsonb
on the evidence's machine rows. One jsonb, not nine typed columns.

⏳ **STILL TO BUILD: the export itself.** `reliability_wrr` and `details` are the
data; nothing yet writes the two-sheet workbook. `src/lib/xlsx.ts` already makes
multi-sheet files. The template's headings differ from what the user typed —
**Customer Name** not Party Name, **Town** not City, **Installation date** not
Warranty Start Date, **warranty stop** not Warranty End Date — and the export
must use the TEMPLATE's, or the paste lands in the wrong columns.

### Nine years of history vs the 500 MB cap — SIZED (2026-09-07)

The user has call and failure data back to **2017** and wants it in the system.
None of it is loaded: `field_calls` starts 2026-01, `pm_calls` 2024-09.

**Measured cost per row, from the live project:**

| | rows in db | data/row | ALL-IN per row (with indexes) |
| --- | --- | --- | --- |
| `field_calls` | 3,959 | 1,124 B | **7,152 B** |
| `pm_calls` | 7,029 | 2,088 B | **6,860 B** |
| `installation_calls` | 459 | 1,981 B | 8,262 B |
| `reports` | 16,168 | 531 B | 908 B |

**Volume, per the user:** field ~5,900/yr, **PM ~10,000/yr minimum**,
installation ~690/yr — about **16,600 calls a year**, so 2017-2026 is
~**150,000 calls** and ~210,000 visits.

| | rows only | with the CURRENT indexing |
| --- | --- | --- |
| 150,000 calls | ~170-260 MB | **~1.05 GB** |
| ~210,000 visits | ~110 MB | ~190 MB |
| **total** | **~280-370 MB** | **~1.25 GB** |

⚠️ **THE FREE TIER CANNOT HOLD THIS, EVEN SPLIT.** Archive-indexed (btrees on
UCN / serial / reg_date, NO trigrams) it is still ~400-520 MB — one archive
project completely full with no room for next year. Live-indexed it needs three
projects today and a fourth within two years.

**The recommendation is Supabase Pro** (8 GB, ~$25/mo): 1.25 GB fits six times
over, everything stays joinable, RLS keeps working, and the apply bundles and
check scripts keep meaning something. Splitting a validated quality system
across three databases nobody can join is far more expensive than the
subscription — most of all the first time a figure is wrong because half the
data was in the other project.

**THE INDEX MULTIPLIER IS THE WHOLE STORY.** Rows are ~300 MB; indexes take it
to 1.25 GB. The bulk is `pg_trgm` (substring search on party name, call number,
complaint text). An archive nobody types into does not need them — that alone is
the difference between 4x and ~1.4x.

#### ⏳ TO CHECK — the user is doing this (2026-09-07)

1. **THE PM COUNT IS SHORT.** At 10,000/yr, 2024-09 → 2026-09 should hold
   ~20,000 rows. `pm_calls` has **7,029 — about a third.** Whatever loaded it
   stopped early or was filtered. **Find out before nine years go through the
   same path**, or the backfill silently loses two thirds of itself.

2. **PM ROWS MEASURE NEARLY DOUBLE.** 2,088 B/row against `field_calls`' 1,124,
   for tables with IDENTICAL columns (the 0040 split). Either PM complaint text
   really is twice as long, or `pm_calls` is carrying bloat. Across 150,000
   calls that is 170 MB vs 310 MB of rows — 140 MB on a 500 MB allowance. If it
   is bloat, `VACUUM FULL` returns it; if it is real, it has to be budgeted.

3. **`handstock_period.closed_through`** — still unanswered. While it is NULL,
   `handstock_cutoff()` is `-infinity` and EVERY row of
   `spare_issue_history` + `spare_consumption_history` (68 MB) still feeds live
   hand stock. Nothing there is safe to move until a period is closed. Hand
   stock is derived, never stored, so removing source rows changes balances with
   no error and no warning.

#### Also worth knowing

**Visits reach back further than calls.** `reports` holds visits from 2021-08
while the call registers start 2024/2026 — 16,168 visits against 11,447 calls.
Those visits' calls are missing today and will re-attach when the history loads.
Worth confirming that is "visits loaded first" and not a partial call load.

### Where the 331 MB actually is (2026-09-07, measured)

From the user's own `_storage_check.sql` output. **331 MB of disk, not 450** —
the dashboard figure is larger because it counts more than `public` (WAL, and the
`auth` / `storage` / `realtime` schemas).

| | total | heap+toast | indexes |
| --- | --- | --- | --- |
| `pm_calls` | 46 MB | 14 MB | **32 MB** |
| `spare_issue_history` | 35 MB | 26 MB | 9.7 MB |
| `spare_consumption_history` | 33 MB | 28 MB | 5.4 MB |
| `field_calls` | 27 MB | 4.3 MB | **23 MB** |
| `products` | 22 MB | 16 MB | 6.5 MB |
| `spare_request_lines` | 20 MB | 18 MB | 2.1 MB |
| `reports` | 14 MB | 8.4 MB | 5.6 MB |
| `parties` | 12 MB | 3.7 MB | **8.1 MB** |

**INDEXES ARE THE LARGEST SINGLE COST.** `field_calls` carries 23 MB of indexes
over 4.3 MB of data — more than five times the table. The three call tables plus
`parties` hold ~66 MB of indexes over ~23 MB of heap, and the biggest ones are
all `pg_trgm` (substring search on party name, call number, complaint text).

**I predicted `record_audit` and I was wrong.** It is 8.8 MB — 2.6% — and of that
only 792 kB is heap: the table is effectively empty and the 8 MB is INDEX BLOAT.
A `reindex` reclaims it. Worth doing, not worth planning around.

⚠️ **THE "NEVER USED" FLAGS IN THAT RUN WERE NOT EVIDENCE.** Every index read 0
scans *and* `reports` reported 8 live rows — statistics had recently been reset,
so both numbers were empty rather than small. The report now prints
`stats_reset` in section 0 and counts rows EXACTLY (`query_to_xml`), so that
tell cannot be misread again. **Do not drop an index on a scan count taken
inside 30 days of a reset**, and never on a `_pkey` or `_uniq` at all — an
upsert's `on conflict` needs it whether or not anything scans it.

⚠️ **Measure first.** `supabase/apply/_storage_check.sql` (read-only) reports the
database total, every table by size split into heap / indexes / toast, the ten
biggest indexes with their use counts, and dead-row bloat.

**The prime suspect is `record_audit` (0048).** It stored a FULL jsonb copy of
every row on every insert, update and delete — an UPDATE wrote the old row AND
the new one — across every bulk upload this project has run, with three indexes
on top. **0112 stopped the trigger and RETAINED the table**, so it is dead weight
that nothing writes to and only an admin screen reads. What happens to it is a
quality-record decision, not a technical one, but its size is the first number
worth knowing.

Second suspect: dead rows. Autovacuum marks them reusable but does not return
them to disk; only `VACUUM FULL` does, and it takes an ACCESS EXCLUSIVE lock, so
it is an out-of-hours job.

File storage is a separate Supabase allowance and this project does not use it —
uploads go to Drive through the Apps Script bridge.

### A cut-off PER MONTH (2026-09-07) — and a null-propagation bug it turned up

**0138 got the shape wrong and 0139 fixes it.** "Set the Cut Off Date before
Recalculation" was read as ONE date per objective applied to every month a run
wrote; the user meant one **per month**. The consequence was exactly what was
flagged at the time: re-calculating in October with 09-Oct also re-read January
as at 09-Oct, re-basing a figure reported eight months earlier.

`objective_cutoffs(year, month, cutoff_date)` — one row per month per year,
**shared by every objective**, because a cut-off belongs to the reporting round
rather than to any one measure. No write policy at all; `set_objective_cutoff()`
is the only way in, so the admin lock has one door. `recalc_quality_objectives`
is back to **one argument**: it reads the cut-offs, it does not set one.

⚠️ **`has_perm()` RETURNS NULL WHEN THERE IS NO SIGNED-IN USER**, because
`my_extra_perms()` does. So the common guard

```sql
if not public.has_perm('config.manage') then raise exception ... end if;
```

**does not fire** — `not NULL` is NULL, which is not true, and execution falls
straight through into the write. Found when a test fixture referenced a user
that did not exist in that suite and the "engineer" successfully set a cut-off.

`set_objective_cutoff` and `recalc_quality_objectives` now use
`coalesce(public.has_perm(...), false)`. **The bare pattern appears in 15 other
migrations** and has NOT been changed — that is a separate pass, and worth
doing. Not reachable from the API today (execute is granted to `authenticated`,
and a null uid means `anon`), but that is a second lock, not a reason to leave
the first one open.

**A test fixture whose user does not exist tests the null path, not the role.**
That is why it hid this. Fixtures in `objective_periods_test` now create every
user they impersonate.

### The cut-off, settled (2026-09-07)

**The open question below is CLOSED: the cut-off tests the VISIT date.** A call
visited 30 May and written up 3 June is closed in May. Figures moved when 0138
was applied, and that was the point.

The fallback when a solving report has **no visit date** is the entry date, and
the evidence marks the row. Treating a blank as "never solved" would make the
figure worse for a missing keystroke — a metric that degrades on a data-entry
lapse teaches people to distrust it.

**`recalc_quality_objectives(year, cutoff)`** stores the date on every open-rate
objective before computing, rather than holding it for the run. A figure and the
setting behind it must not be able to disagree, and the evidence has to be able
to say what was applied months later. Passing no date changes nothing.

⚠️ **A stored cut-off applies to EVERY month the run writes** — re-calculating in
October with 09-Oct also re-reads January as at 09-Oct. The user asked for this
("the Team is used to this way of Working") and knows a monthly KPI is not
strictly measured that way. It is not hidden: stored on the objective, on the
Re-Calculate dialog, and in the evidence notes.

**The lock** is `objective_cutoff_locked` in `app_settings`, the Audit Mode shape
(0114), plus a TRIGGER on `quality_objectives` — a lock the definition screen's
JSON box could walk around would be decoration. Admins are exempt: the lock holds
back whoever else has `config.manage`, and locking an admin out of their own
switch only teaches them to leave it off.

⚠️ **`recalc_quality_objectives(integer)` NO LONGER EXISTS** — the 1-argument form
is dropped so `recalc_quality_objectives(2026)` is not ambiguous. `_status.sql`
row 95 checks the new signature; anything else calling the old one will fail.

### The solve cut-off (2026-09-07)

`objective_period` returns **three** dates now, and the split is the point:

| | what it decides | moves? |
| --- | --- | --- |
| `period_start`..`period_end` | WHICH calls are counted (registered in the period) | never |
| `solve_cutoff` | whether each was CLOSED in time | `calc_params.cutoff_days` or `cutoff_date` |

They used to be one date. Widening the period to give a grace would have pulled
in the next month's registrations and changed the denominator nobody asked to
change — the bug this shape exists to prevent.

`solve_cutoff` is **always capped at today**. A future cut-off can only ever
move a call from open to closed, so it flatters the figure; that is a HARD STOP
in `objective_notes`, not a preference.

~~**Open question, deliberately left as it was.** The cut-off tests when the
solving report was **ENTERED** (`reports.updated_at`), not the visit date.~~
**ANSWERED 2026-09-07 and changed in 0138: it tests the VISIT date.** Putting
both dates in the export is what let the question be settled by looking rather
than arguing — see the entry above.

### Objectives 8-12 — what is computed and what is still typed (2026-09-07)

| # | Objective | Freq. | Computed by | State |
| --- | --- | --- | --- | --- |
| 8  | Breakdown Calls | Monthly | `open_rate_monthly` `{"family":"field"}` | ✅ |
| 9  | Preventive Maintenance Calls | **Quarterly** | `open_rate_monthly` `{"family":"pm"}` | ✅ |
| 10 | Installation call | **Quarterly** | `open_rate_monthly` `{"family":"installation"}` | ✅ |
| 11 | Problem Call attending within 3 days | Monthly | `attended_within_days` `{"family":"field","days":3}` | ✅ |
| 12 | b.Customer feedback | **Quarterly** | — | ⏳ typed; the user is detailing the logic |

`public.feedback` exists (one row per visit, `answers jsonb`) but nothing says
how a score is derived from it. **Left typed on purpose** — a number nobody
agreed to is worse on a quality record than a blank one.

**Two readings put into 11 that the user has not confirmed**, both one field on
the screen to change, and both now STATED in the evidence file rather than
buried: "within 3 days" is read as an attended-in-days of **3 or fewer**, and
"Problem call" is read as the **field** register.

⚠️ **`frequency` is now load-bearing.** It used to be a label. `objective_period`
reads it, so editing an objective's Monitoring Frequency changes how it is
measured. "Monthly" and "3 Months"/"Quarterly" are recognised; anything else
reads as monthly — the safer wrong answer, since a monthly reading of a
quarterly objective still reports every month and the reverse loses eight.

**`call_type` turned out to be trustworthy after all.** The plan was to stop
using it because all three call tables DEFAULT it to 'FIELD'; the schema in
fact CHECKs `call_table_for(call_type)` against each table's own name, so a row
cannot sit in the wrong register. `calc_params.family` is still what the
objectives use — it reads one register instead of the union of three, and
"which register" is the question being asked — but not for the reason first
assumed. Found by inserting a fixture and reading the constraint, not by
reading the column default.

### To run on the live project — NOTHING PENDING (2026-09-07)

**"all sql executed" — the user, 2026-09-07**, covering both bundles below.

⚠️ **REPORTED, NOT VERIFIED FROM HERE.** No `_status.sql` output has been seen
for this round, so rows 93-103 are *expected* to read `yes` and nothing in this
file is evidence that they do. The live project cannot be reached from the
sandbox. Run
[`_status.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/_status.sql)
before diagnosing anything here — that is the check, and this is only a note.

Two rows are expected to stay `NO` and are NOT missing migrations:
**`performance: JIT is OFF`** and **`DCCR: ...at a quarter past nine`** (pg_cron
must be enabled in Dashboard → Database → Extensions, then `daily_review.sql`
re-run). Both are project settings rather than SQL.

**The figures do not appear until Re-Calculate.** Applying the SQL installs the
machinery; `recalc_quality_objectives` is explicit by design and nothing is
written to the twelve month columns until an administrator presses it on the
Objective page.

What the two bundles brought:

| bundle | brings | rows |
| --- | --- | --- |
| [`objective.sql`](https://github.com/neurolooom-eng/RITHI_CRM/blob/main/supabase/apply/objective.sql) ([raw](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/objective.sql)) | 0130 the objectives register, 0132 Re-Calc + evidence, 0133 the serial filter (the Indian Extend), 0134 the machines as rows, 0135 the installation base as a Product Master listing with the filter stated, 0136 quarterly periods + objectives 8-11 + the stated assumptions, 0137 the settable solve cut-off + the closure date in the export, 0138 closure on the visit date + the admin lock, 0139 a cut-off PER MONTH | 93, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106 |
| [`performance.sql`](https://github.com/neurolooom-eng/RITHI_CRM/blob/main/supabase/apply/performance.sql) ([raw](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/performance.sql)) | 0128 the KPI Field & Installation export (columns A–AB), 0131 Phase 2 (AC–AG + Pending Days), 0129 `products.serial_key` | 94 |

⚠️ **This is a note, not evidence.** Run
[`_status.sql`](https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/supabase/apply/_status.sql)
before diagnosing anything here — this file has twice claimed the opposite of
what was applied.

**0132–0134 now DROP `objective_evidence` before creating it.** The return type
widened in 0135, and `create or replace function` cannot change a return type —
so replaying `objective.sql` onto a database that already carried the new shape
failed outright, the same way `create or replace view` failed once 0131 widened
`kpi_field_inst`. Caught by `npm run check:replay`, which is the only thing that
finds this class. Both are the same rule stated twice: **a file has to be
runnable on a database in any state, not only on an empty one.**

**`products.active` is deliberately NOT honoured** by the installation base.
The column exists and defaults to true; nothing in this system reads it, and
nothing maintains it. Filtering on it would move every failure rate on the
strength of data that has never been kept. If it is ever maintained, that is
the moment to revisit — not before.

### To run on the live project — NOTHING PENDING (2026-09-06)

**Everything run by the user on 2026-09-06.** In one go, after the ordering
note went into `_status.sql`'s header:

| bundle | brings |
| --- | --- |
| `call_requests.sql` | 0113 (created_by is the database's to say), 0114 (the desk of record + `actual_created_by`) — rows 66, 67 |
| `audit.sql`         | 0114 audit (the Audit Mode switch + its change log) — row 68 |
| `rbac.sql`          | 0087/0088 moved here, so `srl_insert` stops being reverted — row 40 |
| `Spare_1.sql`, `HandStock_X.sql`, `masters.sql` | the five policies a bundle replay had reverted, and the blanket `masters_write` it had recreated — rows 69-74 |
| `reports.sql`       | 0115 (a visit cannot be dated in the future or before the complaint) — row 75 |

ORDER MATTERED and is now written into `_status.sql`'s header rather than only
in a chat message: `rbac.sql` FIRST, then the other three. Run the other way
round it re-reverts rows 69-74, which is exactly how row 40 came back NO after
the first attempt.

✅ **VERIFIED — every row of `_status.sql` reads `yes`, all 85**, from the
user's own output on 2026-09-06 after the runs above. Not "reported" this time:
this round has the evidence behind it, which is the only thing that makes a
line in this file worth reading. (The rule still stands for every other entry —
`_status.sql` is the evidence, this file is a note, and it has twice claimed
the opposite of what was actually applied.)

Worth keeping in view because two rows now read `yes` for a REASON THAT CAN BE
UNDONE: row 40 and rows 69-74 are correct because `rbac.sql` was run FIRST.
Running it again on its own, without the other three afterwards, puts them
back to NO. `_status.sql`'s header says so; `npm run check:bundles` lists the
24 further rules with the same shape.

⚠️ **Still outstanding on the user's side, and NOT SQL** — "ran all sql
scripts" does not cover these: the 77 missing yearly consumptions (delete +
re-upload the four files per `_yearly_consumption_check.sql`, to 39,801 total
with 12,015 in 2024), and the Ownership Transfer upload.

### To run on the live project — NOTHING PENDING (2026-09-05, third round)

**`daily_review.sql` and `data_integrity.sql` run by the user on 2026-09-05**,
bringing 0111 (the DCCR's Call Status filter, via `open_state` on the summary
view) and 0112 (record_audit stopped — no trigger writes to it now; the table is
retained). `_status.sql` rows 60 and 65 cover those two.

⚠️ ROW 60 IS INVERTED from what it used to assert. It checked that the
record_audit trigger EXISTED; it now checks that none does. A `yes` there means
the trail is OFF, which is the intended state — do not "fix" it by re-applying
0048.

⚠️ REPORTED, NOT VERIFIED FROM HERE, same as the round above.

### To run on the live project — NOTHING PENDING (2026-09-05, second round)

**`call_requests.sql` and `rbac.sql` run by the user on 2026-09-05**, bringing
0107 (complaint-text help), 0108 (cancel a call), 0109 (close without a visit)
and 0110 (an admin resets a password) live. `_status.sql` rows 61-64 cover
those four.

⚠️ REPORTED, NOT VERIFIED FROM HERE. This records what the user said they ran;
nothing in this file is evidence that a migration is applied. Run
`supabase/apply/_status.sql` before diagnosing anything that looks like one of
these features misbehaving — that is the check, and this is only a note.

### To run on the live project — NOTHING PENDING (2026-09-05)

**Every row of `_status.sql` reads `yes` — all 70.** From the user's own output
on 2026-09-05, after running `call_requests.sql` (0104 + 0105),
`sales_contracts.sql` (0106), `data_integrity.sql` (0103) and `HandStock_X.sql`
(0102).

⚠️ **0102 and 0103 were confirmed by a one-off query, not by `_status.sql`,
because I had not added rows for them** — I added rows for 0104–0106 and
forgot these two. The report's silence looked like coverage. Rows 59 and 60
close that, and the rule stands: **a bundle that gains a checkable object gains
a `_status.sql` row in the same change.**

#### What 0105 changed on the live system, and what to expect

The `calls` view had lost `security_invoker` when 0057 rebuilt it, so it read as
its OWNER: **every signed-in user could read every call**, and `pending_calls`,
`call_state` and the KPI views inherited that reach despite carrying the setting
themselves. Now closed.

**Engineers and managers will see FEWER calls** — the ones their role permits.
A report of "I have lost my calls" is the fix working. `npm run check:views`
fails on any view over an RLS-protected table lacking the setting, so the class
cannot return silently.

Also fixed, and needing no SQL: `updateFieldCall` never delegated to Supabase,
so EDITING a call was posted to the Apps Script bridge while CREATING one went
to the database.

### Everything before this was applied — NOTHING ELSE PENDING (2026-09-04)

**Every row of `_status.sql` reads `yes` — all 65.** Read from the user's own
output on 2026-09-04, after they ran `performance.sql`, `call_requests.sql`,
`HandStock_X.sql`, `_handstock_opening_engineers.sql` and finally
`user_directory.sql`. That covers migrations 0092–0101 and the opening-stock
correction.

Do not re-add anything here without a status read. This file is a record, not
evidence — it has twice claimed the opposite of what was applied, and once (see
below) it named a bundle whose own contents undid the fix it was recommending.

#### What those runs settled, and what to remember from each

- **The Hand Stock timeout was JIT** (`0099`), not the data and not RLS.
  `EXPLAIN` with the JIT block showing: *Optimization 2134 ms, Emission 1440 ms,
  total 3742* — against 174 ms of execution. `jit_above_cost` is 100,000 and the
  planner's estimate for the movement view is half a million, almost all of it
  the cost of RLS sub-plans it barely runs. So the more access rules a query
  carries, the more certain Postgres is to spend seconds compiling it — which is
  precisely why switching RLS off "fixed" it and sent three rounds of work at the
  wrong cause. With JIT off, the whole 102,893-row history reads in 323 ms.
  Reverse with `alter database postgres reset jit;`.
  **If a future screen is mysteriously slow, read the JIT block before blaming
  the policies.**
- **A period can be closed** (`0095`, `0096`) but is no longer needed for speed —
  it is what keeps Hand Stock fast as the years add up. Verified neutral:
  6,203 pools / 257,188 parts before and after, view 102,893 → 22,442 rows.
- **REQID** (`0097`) continues from the register instead of restarting at R1, and
  a bulk load can no longer strand the counter. The two issued out of order are
  now **RC1** and **RC2**.
- **The KPIs and the product list** (`0098`, `0101`).
- **The spare-order engineer can be corrected before dispatch, never after**
  (`0100`), with its own log.
- **Opening stock is active User Master names only**
  (`_handstock_opening_engineers.sql`), by the user's decision on 2026-09-04.
  The uploader now holds the rest back before writing, and `_status.sql` row 55
  keeps it honest.

#### ⚠️ The one that cost a round trip — read this before writing a bundle note

This list previously said: run **`user_directory.sql`** for migration `0092` (the
Reporting Manager name fallback). **That instruction UNDID the fix.** 0092 was
filed under the `rbac` module, so `rbac.sql` carried it and `user_directory.sql`
did not — but `user_directory.sql` replays `0004`, which defines
`visible_engineer_names()` WITHOUT the fallback. Running it put the old
definition back, silently, and the bundle reported success. Row 44 read `NO` on
2026-09-04 for exactly that reason: **applied, then overwritten** — which reads
identically to "never applied".

0092 now lives in **user_directory**, after 0004, so the bundle that owns the
function carries its latest definition. Re-running it is safe, and on a project
that has lost the fix it restores it. That is what turned row 44 green.

**The class**: a bundle must carry the LATEST definition of everything it
defines, or replaying it alone reverts an object a later module redefined.
`npm run check:bundles` reports it, and **twelve objects are still split this
way** — they are listed in that script so the list can only shrink, and a NEW one
fails the check. Among them:

- `dispatch_spare_lines` — re-running **`Spare_1.sql` on its own would revert
  partial dispatch and refurbished issue**.
- `spare_pending_dispatch`, `engineer_stock`, `stock_transfer_lines_check_stock`,
  `notify_spare_dispatched` — all superseded in the `handstock` module.

They are recorded rather than moved because unpicking them changes the order a
FRESH apply runs in, which is the other way this project has broken itself. That
wants its own change, with its own verification. **Until it is done, prefer
`all.sql` over a single bundle when repairing a live project.**

### Uploads — what is loaded, and what is left (2026-09-04)

Confirmed by the user as they went. Counts are what to expect against their real
files.

| register | file | expect | state |
| --- | --- | --- | --- |
| Part Master | `ITEM_Master_2.csv` | — | ✅ loaded |
| Product Master | `v2_ProdMaster.csv` | — | ✅ loaded |
| Hand Stock — WinMax opening | `HS_Winmax.csv` | active engineers only | ✅ loaded, then corrected |
| Stock Out — all years | `Stock_Out.csv` | 48,139 | ✅ loaded |
| Consumption — yearly export | 22H2 / 23 / 24 / 25 | 5,233 / 10,338 / 11,938 / 12,292 | ✅ loaded — see the count below |
| Consumption | `v2Consumption_1.csv` | 8,352 | ✅ loaded |
| Stock Transfer Register → Lines | `ST_Entry` → `StockTransferList` | 338 → 849 | ✅ loaded |
| Master Value Lists | all eight lists | see below | ✅ **complete** |
| **Ownership Transfer** | `OwnershipTransfer.csv` | — | ⬜ **still to load** |

Loaded earlier: Party Master (5,873), Field / Installation / PM calls, Call
Requests, Field Reports, Spare Request (4,081) and its Lines (8,571), MRN (595).

✅ **The value lists are COMPLETE** (the user's read, 2026-09-04):

    calltype 8 · cancelreason 27 · complaint 507 · dccrgrouping 707
    feedbackrating 4 · orapproval 13 · pendingreason 21 · rootcause 657

That is every list in the `master_lists` registry. `party`, `product` and
`spare` look like value lists on the forms but are NOT in this registry —
`listMaster()` resolves them from `parties`, `products` and `parts` instead, so
there is nothing to load for them and their absence is correct, not a gap.

⛔ **The yearly consumption total is 39,724 and should be 39,801** — CONFIRMED by
the user's read on 2026-09-04 (4 files loaded, 39,724 rows). The 77 missing rows
are real consumptions: they were entered in January for December work, so they
belong to 2024, and before v0.9.64 they landed on the same reference as the
first 77 rows of the 2024 file — one silently replacing the other. The code fix
shipped, but **the data only corrects itself on a re-load**.

Consumption is an OUT arm, so 77 missing rows make those engineer/part levels
read **too HIGH**. That is one strand of the user's "the Handstock levels are
incorrect", though 77 rows against 39,801 will only move the pairs they touch.

To correct it: run the DELETE at the foot of
`supabase/apply/_yearly_consumption_check.sql` (commented out on purpose), then
load the four files again. They are history, not a control point — nothing else
points at these rows.

### Open questions put to the user, unanswered
- ~~**WinMax opening:** filter that pool to names in the User Master, or load it
  whole?~~ **ANSWERED 2026-09-04: "only user master - Active names only."** Both
  Opening Stock registers now filter before writing, and
  `_handstock_opening_engineers.sql` corrected what was already loaded.
  `_status.sql` row 55 keeps it that way.
- **A Knowledge Base how-to for Product & Party Search**, as was done for call
  re-allocation (offered, not asked for).


### Queued — waiting on the user
- **Per-tab permissions — deliberately NOT built (user's call, 2026-09-02).**
  The Roles & Permissions tree goes header → page → View + actions. Tabs within
  a page (Pending Dispatch's Queue / Stock outs, the Daily Review stages) were
  asked about and then left out: each needs its own enforcement, and a checkbox
  that nothing enforces is worse than no checkbox. The tree supports a third
  level already — the master lists prove it — so adding them later is a matter
  of naming the tabs and enforcing them, not restructuring.
- **Split User Access out of User Master** (deferred by the user, 2026-09-01).
  `/users` currently redirects into **User Master**, which carries both the
  directory (name, designation, region, reporting/regional manager, validity)
  and the sign-in side (role, extra permissions, create-login, clone).
  The merge was suspected of causing a role bug, but it was **not** the cause —
  the coarse `Role` enum (`admin|manager|engineer|viewer`) was collapsing every
  RBAC role, so Hotline/NSM/Commercial all displayed as "Field Engineer".
  Fixed display-side in **v0.8.63** (`roleLabel()` prefers the real `rbacRole`);
  the merged screen itself already offers the full role list and flags a
  directory-vs-sign-in mismatch. So the split is a **presentation preference,
  not a defect** — pick it up only if the combined screen proves unwieldy in use.
  If done: keep one write path (the directory row is what grants the role on
  first sign-in), or the two screens will disagree.
- **Deploy the scheduled export** — THE SCREEN AND THE DATABASE SIDE ARE LIVE
  (`Administration → Data Export`, section 3; migration `0228`, bundle
  `data_export.sql`). Schedules save; nothing is sent until the function is
  deployed. The Edge Function + schedule are in the repo
  (`supabase/functions/scheduled-export/`, built, not deployable from here).
  Needs a **Resend API key** and the Supabase **CLI**: set the four secrets
  (`RESEND_API_KEY`, `EXPORT_FROM`, `EXPORT_TO`, `EXPORT_SECRET`),
  `supabase functions deploy scheduled-export --no-verify-jwt`, then run
  `schedule_scheduled_export.sql`. Steps in that folder's `README.md`.
  Recipients agreed with the user: **service.almsind@gmail.com**,
  **devika.m@airliquide.com** — and they go in `EXPORT_TO`, NOT in a table, so
  they cannot be changed from any screen.
- **Deploy the daily digest** — the Edge Function + schedule are in the repo
  (`supabase/functions/daily-digest/`, built, not deployable from here). Needs a
  **Resend API key** and the Supabase **CLI** deploy: set the secrets,
  `supabase functions deploy daily-digest --no-verify-jwt`, then run
  `schedule_daily_digest.sql`. Steps are in that folder's `README.md` — an
  earlier version of this line named `daily-digest-DEPLOY.md`, which has never
  existed. Same class of error as a `Restore:` clause naming the wrong file: a
  name in a deploy note is read by somebody deciding WHAT TO OPEN.
- **RBAC view-matrix** — the user will send a matrix of role × module × level
  (who can view/create/edit/approve/export what). Translate it into the role
  defaults in `src/lib/rbac.ts` **and** a `set` SQL that writes the same
  permissions into `app_roles` (live roles are populated, so a code change alone
  is not enough — a DB grant is required).

- **Feedback Without a Report** (`/feedback-without-report`, 0229) — shipped
  v0.9.335. **Needs `supabase/apply/feedback_checks.sql` run on the live
  project.** Its own bundle: it reads `feedback.entry_at`, which 0190 adds to a
  table that has existed since 0001, so filed with `reports` it died on a fresh
  apply — `check:replay` caught it.

## ✅ Done

### Platform & data
- CallReg Apps Script bridge (standalone, opens sheets by ID; JSONP-safe reads
  and writes). Endpoints: ping, tabs, list, parties/products/items, prodsearch,
  auth, users, config/setconfig/configcheck, pending, crnrequest, setucn,
  getview/setview, add/update, reportget/report, tabmeta/tabappend, upload,
  master/masters/setmasters.
- Versioned default Web App URL baked into the app (clients auto-adopt on bump).
- Local caching with 30-min force-sync and "synced X ago"; force-update button.

### Apply bundles
- ⚠️ **A bundle replay was reverting policies, and the check could not see it**
  (v0.9.99, 2026-09-06) — the user's `_status.sql` came back with row 40 NO.
  Nothing had failed to apply: `srl_insert` is created by 0008 (`rbac`) and
  redefined by 0087/0088, which sat in `spare_requests`. Running `rbac.sql`
  for 0110 the day before put 0008's version back, silently, and a spare line
  against a stub parent was refused again. Reproduced exactly: full apply →
  row 40 yes; replay `rbac.sql` → NO.
  - **FIXED for this object**: 0087 and 0088 MOVED into the `rbac` module, so
    every definition of `srl_insert` is in one bundle. Safe order-wise —
    `spare_request_lines`, `request_uid` and `spare_requests` are all 0001
    (base, which runs first), `has_perm`/`is_admin` are 0008 above them, and
    the helper's body is plpgsql so it is not parsed until it runs. Verified:
    fresh `all.sql` clean and all-yes; replay `rbac.sql` alone → row 40 still
    yes.
  - **`check:bundles` NOW SEES POLICIES.** It checked functions, views and
    procedures only, which is why this was invisible to it. Keyed on
    `table.policy`, because two tables may each have an `xxx_read`.
  - It found **24 more**, all older than the check. Listed in `KNOWN` rather
    than unpicked: moving migrations between modules changes the order a FRESH
    apply runs in, which is the other way this project has broken itself.
  - **SIX ARE NOT MERELY LATENT — they had already reverted on the live
    project.** Established by replaying the user's exact bundle sequence
    against a copy and diffing `pg_policies`: `sr_read` (0040), `sr_update`
    (0009), `srl_update` (0016), `cons_read` (0038), `cons_write` (0059), and
    `masters_write`, which 0067 DROPPED and 0008 recreates through
    `execute format()` — so no `create policy` literal exists for the checker
    to find, and policies being OR'd, `masters.edit` could write every list
    again.
  - ✅ **Restored 2026-09-06** by `Spare_1.sql`, `HandStock_X.sql` and
    `masters.sql`, run after `rbac.sql`. Verified on the copy beforehand:
    after those three, every policy matches a full apply and the policy SET is
    identical.
  - ✅ **Row 40 restored 2026-09-06 by `rbac.sql`.** ITS RESTORE BUNDLE HAD
    MOVED, and that cost a round trip: because 0087/0088 are now in `rbac`,
    `Spare_1.sql` no longer carries them — so the fix for row 40 is `rbac.sql`,
    and I named Spare_1/HandStock_X/masters, which left row 40 NO. And
    `rbac.sql` reverts the six, so ORDER MATTERS: `rbac.sql` FIRST, then
    `Spare_1.sql`, `HandStock_X.sql`, `masters.sql`. Verified by
    reproducing their exact reported state and running the four in that order:
    every policy then matches a clean full apply and the policy SET is
    identical. `_status.sql`'s header now states the ordering and row 40 names
    its restore bundle, so the next reader is not relying on my having said it.
  - `_status.sql` rows 69-74 report all six by name with the bundle that
    restores each — verified BOTH ways (all yes on a full apply, all NO after
    an `rbac.sql` replay). The KNOWN list cannot tell anybody their live
    project has drifted; these rows can.

### Spares
- **Reject and Drop in bulk, behind a confirmation** (v0.9.106,
  `0118_spare_bulk_decisions.sql`) — `decide_spare_lines(ids, decision, actor,
  reason)` takes the decision as an argument and `approve_spare_lines` (already
  live, so its signature is kept) is now one line calling it. Three near-copies
  of the same stage resolution would have drifted within a release.
  - A REASON is required for reject and drop and refused if blank. An approval
    explains itself; ending somebody's request does not, and a register of
    reasonless rejections cannot be reviewed afterwards.
  - Nothing acts on the button press: it opens a confirmation naming the
    decision and the count, which is also where the reason is asked for — the
    database refuses a reasonless one either way, so the form asks rather than
    the error message.
  - 0033 applies to reject at the RM stage as much as to approve, because the
    TRIGGER refuses it either way; a function that promises what the trigger
    then refuses is worse than one that says no itself.
  - ⚠️ **FOUND WHILE BUILDING IT: `spare.drop` was never granted to anybody.**
    0036 built the feature — the guard, the `Dropped` stage, the button — and no
    migration ever put the permission in `app_roles`. `has_perm` falls back to
    the engineer defaults only for a role with ZERO permissions, and every role
    has some, so the answer was always false. Only an administrator (who passes
    `is_admin()` first) could ever drop a spare, and the button never rendered
    for anyone else because the client reads the same table. 0118 grants it to
    spare_coordinator, hotline and stores_incharge — the roles 0036's own
    header names.
  - ⚠️ **Run `Spare_1.sql`** — `_status.sql` row 78, verified NO before and yes
    after.

- **Bulk approval, and an RM queue of its own** (v0.9.103,
  `0116_spare_bulk_approval.sql`) — tick boxes on the spare register plus a new
  `/spare-rm-approval` screen modelled on Pending Dispatch.
  - `approve_spare_lines(ids, actor)` approves each line **at the stage it is
    at**, so a mixed selection advances everything one step and nothing skips a
    review. It SKIPS what the caller may not approve and returns
    `approved / skipped / reason` — a batch of forty that fails on one line is a
    batch you take apart by hand.
  - **"All stages" is a PERMISSION, not a bypass.** The NSM role gains
    `spare.approve_rm` and `spare.approve_commercial` (MERGED, never
    overwritten). A bypass flag would put a second invisible rule beside the
    0016 guard; a permission shows on the Roles screen and an admin can revoke
    it without a migration. Admin/Super Admin already pass the guard.
  - 0033 still applies inside bulk — never your own request, a manager only
    within their tree. Tests 2 and 3 are what fail if that stops holding.
  - ⚠️ **`spare_rm_may_approve()` depends on `user_directory`, not `profiles`.**
    With no directory row `my_dir_name()` is null, the self-test never matches
    and `has_reports()` is false, so the function falls through to its
    permissive branch. My first run of the suite proved exactly that against
    profile-only fixtures. Pre-existing (the single-line guard uses the same
    function), but worth knowing: an approver missing from the directory is
    less constrained, not more.
  - Found by running it: `why := why || 'text'` on a `text[]` makes Postgres
    parse the literal AS an array and fail. `array_append` says which meaning
    is wanted.
  - ✅ **`Spare_1.sql` run 2026-09-06** — `_status.sql` row 76.

### Every register
- **A layout can be set for a ROLE** (v0.9.117, `0120_role_table_views.sql`) —
  "like save for everyone, I need option to set the views to roles". One row
  per (register, role) holding columns, order, widths and GROUPING; `role = ''`
  is everyone, so the same mechanism answers both and they cannot drift.
  - The old "save for everyone" went through the Apps Script sheet bridge,
    carried only the columns, and had no notion of a role. On a Supabase
    project it now routes through the same function with an empty role.
  - **Ranked by WHEN, not by who** — the reader's own arrangement carries
    `at`, the role layout carries `set_at` stamped by the database (a caller
    cannot back-date one). Same rule as the Auto Save default and for the same
    reason: "the admin always wins" makes every column picker a lie, "your own
    always wins" makes "apply to a role" a lie.
  - A layout stored before 0120 has no `at`, so it reads as time 0 and yields
    to the first administrator layout — an upgrade must not look like somebody
    actively arranging.
  - Writes go through `set_role_table_view()` / `clear_role_table_view()`; the
    table itself refuses `insert` from `authenticated`, so the rule lives in
    one place and `set_at` cannot be forged. Test 9 asserts that.
  - `my_table_view()` resolves the role IN THE DATABASE — a role name is never
    matched in the browser against a role the browser only thinks it has.
  - ⚠️ **Run `rbac.sql`** — `_status.sql` row 80, verified NO before and yes
    after.

- **Load more, Refresh and the sync age live together** (v0.9.105) — the user's
  rule, with the AppSheet screens as the reference: they answer the same
  question the count does ("is this current, and is there more?"), so they
  belong beside it in the heading, not in each table's toolbar among the
  controls that act on rows. 21 registers moved by script plus 5 by hand;
  `PageHeader` gained `onRefresh` / `refreshing` / `syncedAt`.
  - `check:ui` now REFUSES a `↻ Refresh` or a `timeAgo()` inside a `<Toolbar>`,
    so they cannot drift back. **`MasterListTable` is the one exception and a
    principled one**: it is embedded inside All Masters, both DCCR master tabs
    and the master list page, so it has no heading of its own.
  - ⚠️ **Found by the sweep: Pending Calls had been showing "⟳ synced never".**
    Its `lastSync` is epoch milliseconds and `timeAgo` did
    `new Date(String(iso))`, which is an Invalid Date for a number. It advertises
    `unknown`, so it now honours one. "never" is the worst kind of wrong answer
    here — it looks like an answer rather than a fault, so nobody reported it.
  - 🔜 **Engineer grouping is NOT yet everywhere.** The `<FacetChips>` strip is
    on Field Calls, Pending Calls, Spare Requests and KPI Analytics only. Other
    registers group by engineer through the DataTable's `groupable` instead.
    Extending the strip is per-register work: each needs a count source, and the
    "+" rule decides whether those counts carry one.

### Daily Call Review
- **Auto save: two decisions, the later one wins** (v0.9.116) — an admin can
  apply it to everyone; a reviewer can still set their own. The rule for the
  disagreement is the whole design: `effectiveAutoSave(mine, org)` compares
  WHEN each was decided. "The admin always wins" would make every reviewer's
  switch a lie; "a personal choice always wins" would make "apply for everyone"
  a lie.
  - The org default lives in `app_settings`, whose write policy is already
    admin-only (0047) — so the gate is the database's, not a hidden button. No
    migration.
  - Two keys, written together: the value and WHEN it was set. The timestamp is
    the load-bearing part.
  - The pre-existing `'1'`/`'0'` localStorage shape reads as "chosen at time 0",
    so an upgrade cannot look like somebody actively choosing and outrank the
    administrator. Pinned in `check:ui`.

- **Review 2 in bulk, except inside the first year** (v0.9.112,
  `0119_bulk_review2.sql`) — the user's rule: "if the Age at failure is less
  than 366, then it has to be done 1 by 1. If it is not, then it can be bulk
  set." That rule IS the function, not a caveat on it: Review 2 is where
  Warranty Failure (1 yr) is answered, so a machine under a year old is exactly
  the case the question exists for.
  - Enforced in the DATABASE as well as the screen. A hidden checkbox is a
    convenience; this is a quality record.
  - An UNKNOWN age is refused too — "not known to be inside its first year" is
    not "known to be outside it". If that excludes too much of the register it
    is one line, but it should be changed with the numbers in front of somebody.
  - Never overwrites a Review 2 already answered; skips and counts rather than
    failing the batch, like the spare batches.
  - The rule is `bulkReview2Block()` in `lib/dccr.ts`, pure, so `check:ui` pins
    the boundary both sides (365 refused, 366 allowed) without a database.
  - ⚠️ **The migration shipped early by accident** — swept into #167 by a broad
    `git add -A` while three asks were in flight, so 0119 reached `main` with no
    test, no `_status.sql` row, no UI and no changelog. All four followed here.
    The lesson is the commit discipline, not the migration: stage what the
    commit is about.
  - ⚠️ **Run `daily_review.sql`** — `_status.sql` row 79, verified NO before and
    yes after.

- **The worklist tabs scope the QUERY, and highlight means contrast**
  (v0.9.109) — two user reports on the Review Desk.
  - ⚠️ **"Review 2 Pending 175" was showing 85.** The tabs narrowed the LOADED
    PAGE in the browser: the register reads 500 rows of everything, of which 85
    happened to be at that stage, and Load more was the only way to the rest.
    `deskStage` now goes into `ReviewFilter.status`, so the read is scoped and
    one page covers the worklist.
  - The counters are deliberately **not** scoped by review status — a counter
    narrowed by the very thing it counts can only report itself, and the Review
    2 tab would zero the number on the Review 3 tab. Same rule the facet chips
    follow. `inView` is what that leaves: the stage's own total where one is
    chosen, the register's where none is.
  - **"Highlight" means CONTRAST, not a tint** — now in CLAUDE.md as a standing
    preference. The first attempt was `--primary-soft` and it did not read on
    screen. The lifted facts INVERT (`background: var(--text); color:
    var(--surface)`) and the first-year warning is solid `--danger`; both hold
    in either theme by construction. Call Status is the exception and keeps its
    semantic colour, because inverting it would throw away what the colour is
    carrying.

- **A first-year failure is a warning, and the review's four facts are lifted**
  (v0.9.108) — the user's marks on the Review Desk screenshot.
  - `age_days < 366` (the user's line, not 365) renders as a red warning with
    ⚠️ rather than a grey note. It is the ANSWER to "Warranty Failure (1 yr)"
    sitting directly above it, and it was set in the same type as "over a year
    old", so the reviewer had to read the number and do the arithmetic.
    `check:ui` pins the boundary — `<= 365` or `< 365` would move the day
    silently.
  - CUSTOMER, PRODUCT · SERIAL, CALL STATUS and NATURE OF COMPLAINT get
    `is-key` on the call card: weight, size and a tinted ground rather than a
    highlighter colour, so it holds in both themes. Call Status uses the new
    `CALL_STATE_TONES` — the call's own state is not a review stage and must
    not be coloured as one.

- **Review 2 Pending / Review 3 Pending are tabs** (v0.9.107) — the two lists
  somebody sits down to clear, so they are tabs rather than a filter to set
  every morning. Each is the **Review Desk narrowed** (`deskStage`), not a
  second copy: same three panes, same questions, same save, so they cannot
  drift from it. `check:ui` asserts they render `tab === 'desk' || 'r2' || 'r3'`
  through one block.
  - The tab counts come from `countCallReviews`' full walk, so they are EXACT
    and take no "+". The Calls pane's own number is what has LOADED and does
    carry one. Both ways of the rule on one screen again.

- **The Review Desk, and Review 2's two facts** (v0.9.104,
  `0117_frequent_failure.sql`) — the three-pane setup the user asked for, from
  the AppSheet original: calls grouped (Review Stage, then Call Status) |
  the reviews | what happened on the call. Splitters are draggable and the
  widths persist per browser.
  - **ONE BODY IN TWO FRAMES.** `ReviewDrawer` gained `layout='drawer' |
    'panes'` and renders the same fields either stacked (drawer) or side by
    side (desk). A second copy of the review fields would drift from the first
    and one of them would stop matching the rules; `check:ui` asserts there is
    exactly one "Review 2 · Risk assessment".
  - The divider must be a GRID CHILD between the two panes — appending it after
    them puts the details pane in the 6px track. Caught before shipping and
    pinned.
  - **Age of the product** moved from "From the report" to sit under Warranty
    Failure (1 yr), with the one-year line drawn rather than left as arithmetic
    on a day count.
  - **Frequent Failure** now has the register's answer under it: earlier calls
    on the same product+serial with the same complaint, in the 6 months BEFORE
    **this call's own date** (not today's — otherwise reopening an old review
    changes its answer). It lists the UCNs: the reviewer is recording a
    judgement they may have to defend.
    - A blank serial returns NOTHING rather than matching every other
      blank-serial call — a confident number built out of absent data is the
      worst kind of wrong here, because it decides whether an FFR is raised.
    - SECURITY DEFINER on purpose: an answer filtered by the reader's own call
      scope would read LOWER than the truth, which is the one direction that
      matters.
    - A failed read shows "could not be read", never an empty list. `[]` means
      "no earlier failures" and must not be said by accident.
  - **"All NO"** fills the three Review 2 answers; it does not save. Nothing is
    recorded that nobody looked at.
  - Visits are rows (newest first, status, engineer, **the Service Report as a
    link** — previously unreachable from the review); spares are a table
    (#, Part No, Description, Qty) rather than a comma-joined line.
  - ✅ **`daily_review.sql` run 2026-09-06** — `_status.sql` row 77.

### Reporting
- **A visit cannot be dated in the future, or before the complaint** (v0.9.100,
  `0115_visit_date_sanity.sql`) — the user's two rules for the Visit Update
  form. The future one is the one with teeth: a call's status comes from its
  LATEST visit, so a visit dated next week closes a call nobody has been to and
  keeps it closed until that day passes.
  - The form bounds the picker (`max` today, `min` the complaint date) AND
    re-checks on submit, because `min`/`max` stop the picker and not a pasted
    value. The rule itself is `src/lib/visitdate.ts`, pure and with TODAY passed
    in, so `check:ui` pins it without a DOM — the same shape as
    `fieldcall.ts` / `docmatch.ts`.
  - The complaint date falls back to the registration date where a call carries
    none (installations, PMs, older imports); with neither, only the future rule
    applies. Refusing the visit instead would invent a requirement the call
    never carried.
  - **The database enforces it too, and deliberately NOT on history.**
    `reports` is also where the superseded system's visits live, and they must
    load exactly as they were — an imperfect date is still the record of what
    happened, and refusing the file leaves a GAP instead of an imperfection
    (0089 makes the same exemption for imported stock). The signal is the row's
    own id: `WEB-…` is the form (checked), `IMP-…` is Bulk Uploads and anything
    else is Bulk Report Mapping / a restore (not checked). Tests 5, 6 and 9
    exist to catch it if that ever stops holding.
  - Not `> now()`: the app writes the chosen day as UTC midnight, which is still
    in the future until 05:30 IST — a naive test would refuse a visit entered
    early in the morning and dated today. It compares DAYS, the visit's own
    (UTC, as written) against today in India.
  - ✅ **`reports.sql` run 2026-09-06** — `_status.sql` row 75, verified NO
    before and yes after.

### Calls
- **The desk of record and the person at the keyboard** (v0.9.98,
  `0114_call_registrant_split.sql`) — the user's correction to 0113: one column
  was carrying two different facts. `created_by` is now the Hotline DESK a call
  is filed to, defaulting to the hotline-role profile (SIVARANI) or to an
  administrator's pinned choice (`app_settings.calls.default_registrant_email`,
  set on Admin Config → Call Registration). `actual_created_by` is the person
  who typed it in — service.almsind / devika.m / karthiksundar.b when she is
  away — stamped from `auth.uid()` with a caller-supplied value DISCARDED. A
  supplied desk is accepted only when it names a hotline desk.
  **The two DIFFERING is the finding**, and section 4 of
  `_registered_by_check.sql` is that list.
  - The backfill is exact, not a guess: until now `created_by` WAS the person at
    the keyboard, so `actual_created_by := created_by` loses nothing.
  - `calls` / `pending_calls` rebuilt to carry the column (appended — `create or
    replace view` can only add at the end), `security_invoker` re-asserted on
    all three views, and the INSTEAD OF functions regenerated so a write through
    the view carries it.
  - **The RLS arm had to widen**: the visibility test allowed "a call you
    created", and with `created_by` now naming the DESK that arm stops matching
    for exactly the people this is about. Devika would have lost sight of the
    call she had just typed in. It tests either column now.
  - ✅ **`call_requests.sql` run 2026-09-06** — `_status.sql` rows 66 and 67.
  - Two hotline profiles and no pinned setting is an AMBIGUITY: the database
    returns no desk and files the call to whoever registered it, rather than
    picking one arbitrarily. That is the case the Admin Config card exists for.
- **Audit Mode** (v0.9.98, `0114_audit_mode.sql`) — an admin-only switch, asked
  for with the rules to follow ("I will give the list of rules for that later").
  **Nothing reads it.** The switch, `set_audit_mode()` (admin-only, refuses
  without a reason) and `audit_mode_changes` (no insert/update/delete path
  through the API, not touched by the audit-log retention purge) are built and
  tested; no application behaviour is conditioned on the mode. Documented in the
  Validation Package as **NAR-001, the package's first Non-Auditable
  Requirement** — a statement about PROVENANCE (not derived from a regulatory
  clause, not offered as evidence against one), not about its use going
  unrecorded.
  - ✅ **`audit.sql` run 2026-09-06** — `_status.sql` row 68.
  - 🔜 **Pending from the user:** the rules. Each is to be assessed on its own
    merits when it arrives; a rule that would alter, conceal or suppress a
    quality record, or change what a record shows an assessor, is outside the
    NAR classification and needs raising as an auditable requirement with its
    own risk assessment first.
- **`supabase/apply/_registered_by_check.sql`** — read-only: how much of the
  register is attributable at all, where the line falls between stamped and
  unstamped, WHO has been registering calls, and (section 4, added with 0114)
  the calls whose desk and keyboard disagree. Two
  defects were found by running it against a fixture rather than by reading it:
  sections 3/4 used an INNER join to `profiles`, which silently dropped a call
  whose registrar's profile had gone — out of a count whose whole purpose is to
  be complete; and section 5 gave the same label to "no registrar stamped" and
  "stamped, but no profile", which are different facts and only one is a gap.
- **Who REGISTERED a call is the database's to say** (v0.9.97,
  `0113_call_creator_authoritative.sql`) — a COMPLIANCE control, not a
  convenience: only the Hotline engineer is trained on the vigilance questions
  answered at Review 1, so a call registered by anyone else must be findable.
  `zz_calls_stamp_creator` (BEFORE INSERT, named `zz_` so it fires after
  `calls_biu`) overwrites a caller-supplied `created_by` with `auth.uid()`
  whenever there IS one; an administrative connection (auth.uid() null — a
  restore) keeps what it supplies. Surfaced as a read-only "Registered By" on
  the call and a groupable column on all three registers; the DataTable already
  resolves the UUID via `app_user_names`.
  ⚠️ v0.9.96's editable "Registered By (email)" default is WITHDRAWN — editable,
  client-side and skipped whenever `initial` carried an empty string. The
  engineer's email is off the call form entirely; the column and its sheet
  header stay so imported values still export.
  ✅ **`call_requests.sql` run 2026-09-06** — `_status.sql` row 66.
- **The DCCR can be filtered by CALL status** (v0.9.93,
  `0111_dccr_call_status.sql`) — `field_call_review_summary` gains `open_state`
  and `cancelled_at`, APPENDED (`create or replace view` can only add at the
  end) and with `security_invoker` re-asserted. The summary is what the stage
  counters read, so without it a filter the rows honoured and the counts did not
  would make the register disagree with its own header. The filter uses
  `open_state` only: `field_call_review` carries no `cancelled_at`, so Cancelled
  is not offered — `cancelled_at` is on the summary ready for that.
  ✅ `daily_review.sql` run 2026-09-05 (row 65).
- **An open call can be CLOSED without a visit** (v0.9.87,
  `0109_close_call.sql`) — `close_call()` sets `last_status = 'Solved'` and
  nothing else: `last_visit_at` is untouched, so no visit is invented, and the
  call is Solved like any other (the user's decision — NOT a separate state).
  A later report takes over through `sync_call_last_visit`, re-opening the call
  if it says Unsolved. Refuses on a call that is already closed, cancelled or
  re-opened (the last has `close_reopened_call`, which gives the count back).
  Same gate as re-open. ✅ `call_requests.sql` run 2026-09-05 (row 63).
- **A call can be CANCELLED** (v0.9.83, `0108_call_cancel.sql`) — `cancel_call()`
  / `restore_call()` gated on the new `calls.cancel` permission (merged into
  admin, nsm, hotline). `cancelled_at` / `cancel_reason` / `cancelled_by` on all
  three call tables; `call_state` reads Cancelled AHEAD of Reopened and
  `pending_calls` excludes it. NOT a delete — visits and quality records are
  untouched (0049 still stands). `open_state` is deliberately not involved: it
  is a stored generated column on three tables.
  ✅ `call_requests.sql` run 2026-09-05 (row 62).
  ⚠️ 0104/0107 now `create extension if not exists pg_trgm` themselves: 0052
  installs it but sits in `performance`, which runs LAST, so a FRESH `all.sql`
  died at 0104 (a `language sql` body is parsed at creation, so the missing
  operator was an apply-time error). Verified: fresh `all.sql` now applies with
  no errors and `_status.sql` comes back all-yes.
- **The deploy and the branch preview no longer share a concurrency queue**
  — both push to `gh-pages`, so one `pages` group looked right, but a QUEUED run
  is cancelled by any newer arrival in its group whatever that run's own
  `cancel-in-progress` says. Merging and then syncing the branch (the normal
  loop) started a preview that killed deploy run #322 eight seconds in, and the
  site stayed a version behind with nothing to show for it. `pages-deploy` and
  `pages-preview` now. The cost: a preview and a deploy can push together and
  the loser is rejected — that lands on the preview, which is disposable.
- **A call registered from a request is dated to the day it happened** (v0.9.82)
  — `callDateFromRequest()` in `src/lib/fieldcall.ts`: attended date where the
  request was already attended, else the logged instant read through
  `localIsoDate()` (the browser's calendar, not the front of the UTC string).
  Complaint Date and Breakdown Date both take it, and the form shows which and
  why. New Field Call still defaults to today. Pinned by `npm run check:ui`.
- **Reported Problem keeps the house style** (v0.9.81, `0107_complaint_text_help.sql`)
  — `suggest_complaint_text()` offers the alarm number in the PRODUCT'S own
  spelling (the alarm lists already curated per product in the `dccrgrouping`
  master, used until now only at DCCR Review 3), the phrasings that product's
  calls have used more than once, and a WARNING for an alarm number the product
  does not have. `alarm_value_for()` resolves the number, product list before
  COMM. SECURITY DEFINER, aggregates only, same boundary as 0104.
  ✅ `call_requests.sql` run 2026-09-05 (row 61).
- **The call form's live lists are injected, not in the schema** (v0.9.80) —
  Party datalist, the Standard Complaint master with its past-calls suggestions,
  and the engineer list come from `useCallFieldMasters()` in
  `src/modules/callFields.tsx`. That injection used to live inside the Field
  Calls screen, so the **Register panel on a pending request** and the
  pre-mapping call editor rendered the same schema with none of it: Standard
  Complaint was a bare text box, "Call Allocated To" was an EMPTY dropdown, and
  no suggestions appeared. Nothing errored — the boxes were simply empty.
  `npm run check:ui` now fails any screen that renders the call schema without
  the injection.
- Field Call Register — live against the FIELD tab; new calls get a UCN written
  back. Installation Calls — live against INST (same schema, I-type UCN).
- Call Registration Request: the repeatable unit is a **call** —
  Product + Serial No + Standard Complaint + Reported Problem — up to 5 per
  request, each written as its own `call_requests` row under one REQID.
  **Installation Report / KYC are file uploads** to the CallReg Drive folder
  (`driveupload` / `driveref` endpoints); the request stores the Drive link.
- Party → Product → Serial cascade picker (Party + Product Master) auto-fills.
- Add Field Call: today's dates defaulted; warranty/contract freeze once loaded
  from Product Master; section reorder persists.
- Call Registration Request → 2026-CRNRequest; Pending Registrations (Hotline)
  registers UCN-less Data-2026 rows, mapping warranty/contract, back-fills UCN.
- **Request Call Registration is a register** — a table of every request with
  its outcome (Pending / Registered / Mapped / Cancelled) and UCN, status
  filter, search, CSV export and a row-detail drawer; **New Request** raises one
  in a drawer. It used to be a form with no way to see what you had raised.
- **Call Number is assigned, not typed** (`0015_call_number.sql`) — from a
  request it is the request's **UniqueID** (REQID-Product-Serial); a direct
  customer call gets **CLYY#####** (five-digit running number, per year,
  seeded from the existing series). Blank ones are back-filled. It matters
  because reports / spare requests / consumption / feedback are keyed by it.
- **Call status everywhere** — a call is **Solved / Unsolved / Report pending /
  Unattended** by its LATEST visit, derived once in Postgres (`call_state` /
  `pending_calls` views, `0012_call_state.sql`). Colour-coded column on the
  Field / Installation / PM registers, and a **Pending Calls** module
  (`/pending-calls`): every call nobody has closed, with clickable status tiles,
  type filter, search, CSV export and the registers' role scoping.
- **Pending Registrations = the Hotline desk** — clicking a request opens it in
  full and closes it out one of three ways: **map** it to an existing call (its
  UCN goes into the editable **UCN Number (Mapped)** column), **create** a new
  call (UCN assigned and back-filled), or **cancel** it with a reason from the
  `cancelreason` master. Each takes it off the pending list. Column 2 shows
  **Open Calls** — calls on that machine nobody has closed — so a duplicate is
  visible before another is created. Gated on `pending.register`, so the Hotline
  role can act without call-edit rights.
- **Call reporting** (replaces the standalone Call Updation view): "Update Call"
  on every Field/Installation call → Reporting-N tab, keyed by UCN.
  - Sectioned by Call Status: Solved (full report + manual report upload + spare
    consumption → v2Consumption + customer feedback → v2Feedback), Unsolved
    (pending reason only), Report Pending (reason auto-set).

### Access & roles
- **record_audit is STOPPED** (v0.9.94, `0112_stop_record_audit.sql`) — the ten
  triggers are dropped; the TABLE and `record_audit_fn()` stay, so re-attaching
  is one `create trigger`. It existed for 21 CFR Part 11, which is the FDA's and
  does not apply to a CDSCO-regulated operation. ⚠️ It IS a reduction:
  `audit_log` is client-written (bypassable by a direct API call) and purged on
  the retention window; record_audit was neither. FRS-021, R-14 (residual raised
  Low → Medium), FM-16, the ALCOA table and the controls summary all say so.
  ✅ `data_integrity.sql` run 2026-09-05 — record_audit is stopped on the live
  project. `_status.sql` row 60 now checks the OPPOSITE of what it used to
  (that no record_audit trigger remains), so a `yes` there means it is off.
- **The Validation Package is anchored on CDSCO, not FDA** (v0.9.94) —
  Medical Devices Rules 2017 (Fifth Schedule) + ISO 13485:2016 / ISO 14971 /
  ISO/TR 80002-2 / GAMP 5 / CSA, with the IT Act 2000 for the standing of
  electronic records. Every `21 CFR 820.x` and `Part 11 §11.10(x)` citation
  re-pointed; the Part 11 appendix (`PART11`, its screen section and the
  `part11` tab) removed. ⚠️ The clause mapping is the author's and needs RA/QA
  confirmation against the current text.
- **An admin can reset a forgotten password** (v0.9.91,
  `0110_admin_reset_password.sql`) — `admin_reset_password(email, password)`,
  SECURITY DEFINER, gated on `is_admin()`, refusing a super admin unless the
  caller is one and refusing anything under 10 characters. It writes
  `auth.users.encrypted_password` with `crypt(pw, gen_salt('bf'))` — the same
  bcrypt hash Supabase writes — because setting somebody else's password needs
  the service_role key, which cannot be in a browser. ⚠️ Off the supported path:
  it runs no Supabase password policy and stops working if Supabase changes how
  it stores passwords (loudly — the person cannot sign in). Sessions and refresh
  tokens for that user are deleted so the reset takes effect everywhere.
  `password_resets` logs who/whom/when and never the password. The generator is
  `src/lib/password.ts` (crypto.getRandomValues, rejection-sampled, no
  ambiguous characters), pinned by `npm run check:ui`.
  ✅ `rbac.sql` run 2026-09-05 (row 64).
- User Master login (AL / Gmail ID, set-password-first, Validity=TRUE only).
- **User Master is maintained in the app** (`0033_user_directory_role.sql`) —
  admins add and edit directory rows, and each carries the **role** the person
  is granted: `ensure_my_profile()` builds their profile from that row on first
  sign-in, and saving applies the role straight away to someone already signed
  in. Fixes a signed-in user with no profile showing as a bare engineer and
  never appearing in User Access. The address door (0030) still cannot set a
  role.
- Role-based call visibility (engineer = own calls; RM = reporting sub-tree;
  admin = all).
- Admin **"View as"** engineer preview (persistent banner + exit).

### Masters
- **Party Master** — wired (cascade + live datalist in the intake & request forms).
- **Product Master** — wired (cascade + Product Master view + register-from-row).
- Generic master-value layer: `master` endpoint + `useMaster` hook + Admin Config
  → **Master Value Lists** editor (id / tab / column per master).
- **Part Master** — wired to the live ITEM Master (`parts`); search on code /
  description, active filter, Load more, CSV export. (It used to render the
  local demo collection, which `clearDemoData()` empties — hence the blank
  screen.)
- **All Masters** (`/masters`) — one view over every master: the registers
  (Party / Product / Part / User) with row counts, and each value list with its
  values, searchable and exportable. Module grant: `0013_all_masters_module.sql`.
- **Each value list has its own screen** (`/masters/<key>`, Master Lists in the
  sidebar) — one table per master with Add / Deactivate / Remove, shared with
  the All Masters overview.
- **Access is per list.** Roles & Permissions lists every master under the
  Master heading with three switches — open it (`mod:/masters/<key>`), add /
  edit its values (`master.<key>.edit`) and delete one (`master.<key>.delete`).
  Each inherits from the broad key above it, so a role holding `mod:/masters`
  opens every list and one holding `masters.edit` maintains every list; the
  per-list keys exist to grant *less* than that. `0067_master_list_permissions.sql`
  enforces the same split in RLS, so a new list still needs no release.
- **Value lists are their own maintained tables** (`0014_master_lists.sql`) —
  a `master_lists` registry (label, what one row is called, extra columns) plus
  the `masters` rows; All Masters opens each list as its own table with Add /
  Deactivate / Remove, gated per list (above), and clears the dropdown cache on
  every edit. A value in use is deactivated (`masters.active`, 0066) rather than
  deleted, so the records already carrying it keep making sense.
  Seeded from the **200 All Masters** workbook: calltype 8, complaint 507,
  pendingreason 21, cancelreason 27, feedbackrating 4, **orapproval** 13 (that
  one carries Stage + Status columns in `masters.extra`). A new list needs a
  registry row, not a release.
- In-call **Spares Consumed** picker reads the live `spare` master too (it used
  to list the same cleared demo collection). A consumed part is stored by its
  `CODE|Description` catalogue string; the old Amount/Total column and the stock
  decrement are gone — the live `parts` table carries neither price nor on-hand.

### Documents
- **Service manuals + QMS documents** (`0070_documents.sql`, `/service-manuals`
  and `/qms`). The FILE goes to **Google Drive** through the CallReg bridge —
  the same `uploadToDrive` path a manual report takes — and the row here is the
  catalogue entry that makes it findable. A manual is keyed by **product**; a
  QMS document by number / revision / effective date.
  - **The point is the lookup.** Opening a call shows **📄 Supporting
    documents**: the manual for that machine, plus Knowledge Base articles whose
    title / product / tags match the call's product or standard complaint. A
    manual saved with a BLANK product is a general one and is offered on every
    call — which is why `serviceManualsForProduct()` cannot be a plain equality
    filter.
  - Two rights, because they are two jobs: `docs.manage` (manuals) and
    `qms.manage` (the controlled shelf). Everyone signed in READS both — a
    manual nobody can open is no use in the field.
  - A superseded document is **retired, not deleted**: calls were worked from
    it, and the shelf is the record of what the field was told.
  - ⚠️ `script.google.com` is blocked from the sandbox, so the Drive upload
    round-trip has **not** been exercised from here — only the catalogue side.
    The upload reuses the report path, which is in daily use.

### UX
- All tables: column show/hide/reorder/resize (⚙ lists every schema field),
  saved views (per-user + admin "Save for everyone"), ⚑ Filters (top toolbar).
- Mobile & tablet responsive (off-canvas sidebar ≤1024px, full-screen drawers on
  phones, touch targets, no sideways scroll).
- Collapsible sidebar + nav groups (persisted); in-app Version History; sticky
  build footer.

---

## 🔜 In progress / Next

### Migrations to run (Supabase SQL editor)
Apply with the bundles in `supabase/apply/` rather than the numbered files —
run `_status.sql` first to see what the project is missing, then the bundle(s)
it flags. They are generated from the migrations by
`scripts/build-apply-bundles.mjs`, carry their module's migrations in order,
preflight their prerequisites, and are idempotent.

- ✅ **`all.sql` applied (2026-08-29)** — `user_directory` (`0004`), `rbac`
  (`0005`, `0007`, `0008_rbac_enforcement`) and the whole spare module
  (`0006`, `0009`, `0011_spare_intake`, `0012_spare_auto_approval`) are now
  live on the project. None of these had ever been run: the spare tables were
  still at `0001`, which is why the spare register only ever half-worked.
- **`0023_handstock.sql`** — the hand-stock views, and `engineer_stock`
  redefined over them (bundle: **`HandStock_X.sql`**, at the repo root; needs
  `Spare_X.sql` and `stock_transfer` first). Until it is run, the Hand Stock
  module says so and stays empty, and the report form has no stock to consume
  from.
- ⚠️ **An apply bundle must survive being re-run over a LATER state, not just
  a fresh one.** `0023_handstock.sql` used `create or replace view`, which may
  not drop a column — so once `0039` had added `returned` to the balance, every
  re-run of `HandStock_X.sql` (and of `all.sql`, which carries it) died on
  `42P16: cannot drop columns from view`. The views are dropped and rebuilt
  now. Separately, `all.sql` applied `0038`'s consumption-visibility rule from
  the rbac module, long before `0023` added the `engineer_email` it reads, so a
  FRESH project failed at that line; `0038` adds the column itself now. Both
  were found by applying `all.sql` twice in a row on a throwaway Postgres —
  worth doing after any change to a bundled migration. The same check then
  caught `0040_call_tables_split.sql`: it makes `public.calls` a VIEW, so the
  table-only work in `0001`, both `0008`s, `0014`, `0015`, `0032` and `0037`
  (indexes, ALTER TABLE, ENABLE RLS, policies) died on replay. Each of those
  regions is now wrapped in a guard that runs it only while `calls` is still
  a table; on a split project `0040`'s own policies on the typed tables are
  what apply. **Any new table-only statement on `public.calls` needs the same
  guard.**
- **`0039_material_returns.sql`** — MRN (Material Return Note): the return
  register, its `MRN-YYMM-NNNN` numbering, the guard that stops an engineer
  returning more than they hold, and the fifth hand-stock movement that
  subtracts it. Shipped **inside `HandStock_X.sql`** (re-run that file; it now
  carries `0023` then `0037`) rather than as its own bundle, because it adds a
  column to the same two views — a later re-run of the hand-stock file must
  carry it or it would redefine them back without returns. Until it is run, the
  Material Returns module says so and stays empty. `_status.sql` row 17.
- `0011_call_request_actions.sql` — cancel/mapping columns on `call_requests`.
- `0012_call_state.sql` — `call_state` + `pending_calls` views. Until it is
  run, the Call Status column stays blank and Pending Calls says so.
- ⚠️ **Migration numbers have collided repeatedly** (two `0008`s, two `0010`s,
  two `0011`s, two `0012`s) because parallel branches each claimed the next
  number. Ordering between a pair that shares a number is undefined. Worth
  moving to timestamp-prefixed names.



### Supabase cutover — DONE (app now runs on Postgres)
Reads were timing out on Apps Script; the app is now on Supabase (Postgres + auto
REST + RLS + Auth). Migrations `0001`–`0013`, applied per module from
`supabase/apply/`. ⚠️ `supabase/full_schema.sql` is a **stale** snapshot — it
predates the spare module's `0009`/`0011`/`0012` (no `or_no`, no
`spare_needs_review`), so use the apply bundles, not that file.
- ✅ Schema + reports-as-history (per-visit, keyed by UID); data layer
  (`src/lib/supabase.ts`), `sheets.ts` delegates when connected.
- ✅ Baked project URL + publishable key; **email/password login** via `profiles`.
- ✅ Loaded: masters 567, parties 5,872, products 20,999, parts 1,324, calls
  (FIELD+INST+PM) 11,299, reports 16,838 visits.
- ✅ On Supabase: Field / Installation / **PM** registers (**server-side search**,
  no 300-cap), **Dashboard**, product cascade + **Product Master** view,
  **Party Master** view, master dropdowns (paginated past the 1000 cap),
  **Reports** view, **Update Call reporting** (per-visit history, engineer picker),
  **spare consumption + feedback**, **Request Registration** (→ `call_requests`,
  multi-product ≤5, REQID/UniqueID), **Pending Registrations** (the Hotline
  desk over `call_requests`), **Spare Requests** (writes + reads Supabase), in-app **Bulk
  Data Import**, unified **call view** (actions on top + mini-tables keyed by Call
  Number).
- ✅ **Historical requests imported** — the CRN Registration sheet export
  (Data2026) drops straight into Bulk Data Import: 4,083 rows → 4,077 (six
  exact double-submissions deduped on UniqueID), 2,692 requests, Jan–Aug 2026.
  A row with a UCN loads as **Registered**, one without stays **Pending** and
  reaches the Hotline desk. Needs `0024_call_request_extra.sql` — the sheet's
  "Any Open Call?", Regional Manager and Comments / Remarks live in `extra`.
- ✅ **Call requests + call state** — `0010_call_request_items` (a request is one
  row per call sharing its REQID; `unique_key` is the identity; atomic insert
  via `next_call_reqid()`), `0011_call_request_actions` (map / cancel columns),
  `0012_call_state` (the two views) and `0014_call_state_denorm` — the state is
  kept ON the call by a trigger on `reports`, because deriving it per read cost
  >5s under the visit-table RLS (statement timeout). Applied.
- ✅ **Apply bundles** — new SQL goes in `supabase/migrations/` **and** a bundle
  (`node scripts/build-apply-bundles.mjs`): `supabase/apply/call_requests.sql`
  for this module, `all.sql` for everything, `_status.sql` to see what a project
  is missing. Migration numbers are per-module and collide
  (`0011_spare_intake` vs `0011_call_request_actions`) — go by file name.
  `supabase/tests/call_requests_test.sql` exercises the whole set against a
  throwaway Postgres.
- ✅ **Local browser cache + "synced X ago" + 30-min auto/force sync** on masters,
  Reports, and spare tables; **Load more** in every table footer.
- ✅ **Global date formats** (Short `dd-mmm-yyyy`, Long `dd-mmm-yyyy hh:mm:ss`).
- ✅ **RBAC** — 10 roles, admin-editable **Roles & Permissions** matrix
  (functional + per-module actions), enforced in `can()` + nav + route guard.
- ✅ **User Access** — assign role per user + per-user **extra_permissions**.
- ✅ **Spare approval workflow** — RM → Commercial → NSM → Stores(DC); Commercial
  & NSM auto-approve unless item is AMC/OGP; RBAC-gated stage actions.
- ✅ New-call create fix (`0008`: creator can read back the inserted row).
- ✅ **Reporting reads fixed** — every `reports` query ordered by a `created_at`
  column the table never had, so the Reporting page failed with *“column
  reports.created_at does not exist”*. Ordering is now `visit_at` (newest visit
  first, nulls last) tie-broken by `id`. **Run the `reports` apply bundle**
  (`0010_reports_ordering.sql`) for the indexes behind that sort — the app works
  without it, large loads are just slower.

### Migrations to run (Supabase SQL editor)
- **`0032_call_state_by_entry.sql`** (apply bundle: `call_requests`) — the call's
  status now comes from the latest **visit entry** (by entry timestamp), not the
  latest visit date, and "Solved - Report Pending" no longer reads as Solved.
  Until it is run, a back-dated visit can still win and a report-pending call
  drops off Pending Calls.

### Open items & questions
- **User Master data + engineer logins** — directory infra is done and `0004`
  is now **applied** (via the `user_directory` bundle);
  **pending:** import the **User Master CSV** (turns on directory-based scoping +
  the RM→engineer reporting dropdown).
  ✅ **First-time logins are solved:** the app now handles Supabase **invite**
  links as well as reset links — an invited user lands on a "Welcome — set your
  password" screen (`recoveryIsInvite` in `supabase.ts`, `ResetPassword.tsx`).
  ✅ **Bulk provisioning:** `scripts/create-auth-users.mjs` creates confirmed
  Auth accounts from `user_directory` (or a CSV / a list of emails), upserts a
  `profiles` row for each, and optionally sends invite emails (`--invite`). Run
  it locally with the SERVICE_ROLE key. After that, users either get the invite
  email or click **Forgot password?** to set their password.
- **Audit-log retention** — ✅ shipped: `0033_audit_retention.sql` adds
  `purge_audit_log()` and a daily pg_cron job that deletes rows older than 7
  days. **To run:** apply `0033` in the SQL editor as `postgres`; if pg_cron
  isn't on, enable it (Dashboard → Database → Extensions) and re-run. The file
  prints the manual fallback (`select public.purge_audit_log();`) if it can't.
- **Tighten consumption / feedback RLS** to the specific roles — `cons` / `fb`
  still allow any authenticated write. **Spare approvals are done:**
  `0008_rbac_enforcement` scoped `sr_update` and added a per-stage guard, which
  `0009` and `0012` extended to the receipt and auto-approval paths.
- **Raw monthly PM bulk import** — accept the raw PM tab export directly in Bulk
  Data Import (auto-map, preserve back-dated `reg_date`). Back-dating already
  works via the clean-CSV importer.
- **PM Reporting fields** — surface PM-specific report columns in the report form.
- **Product Master derivation + Warranty/Contract registers** — ✅ shipped
  (`0036_sales_contracts.sql`). Sale Entry → Warranty Sale Details and Contract
  Entry → Contract Details are header+item registers: a common value is stored
  once on the header and the item column is an override, so editing the header
  moves every machine that follows it (the exports had 692 warranty dates, 402
  contract statuses and 29 contract types drifted from their own header — those
  land as pinned overrides and are kept). `machine_cover` answers what a serial
  is under today, and `sync_product_cover()` keeps `products` — what the call
  form reads — in step. All four exports import as exported in Bulk Data Import,
  in any order. **To run:** `supabase/apply/_status.sql`, then
  `supabase/apply/sales_contracts.sql`, then import the four CSVs.
  **Now closed.** Ownership Transfer HAS a table (`0072_ownership_transfer.sql`,
  extended by `0080`) — this line was stale, and is the reason to check the code
  rather than this file. The AMC/CMC renewal flow shipped 2026-09-09 (v0.9.170):
  a contract raises its own next MC, carrying its machines, type, party, period
  and billing schedule, starting the day after the old one ends so cover has no
  gap and no overlap. **No migration** — `prev_mc_number`,
  `last_contract_number` and `last_contract_end` were built for it in `0036` and
  had simply never been written to. Rates are deliberately NOT carried: a
  renewal is re-priced.
- **Pending Calls noise** *(watch)* — a call with no visit reported counts as
  Unattended, with no age cut-off, so an old import can crowd the list; add a
  date filter if it does. "Report pending" counts as open (visited, not closed)
  — say so if it should be hidden instead.
- **Manual Report** — ✅ upload restored. The report form takes either a pasted
  Drive link or a file (PDF/photo, ≤10 MB) uploaded through the same
  `driveupload` / `driveref` endpoints the request form uses (folder
  `1-46Ud9j…z2La`); the returned link fills the field, so both paths store one
  ordinary Drive link. The previous visit's report is linked from the drawer.
  Live: CallReg was redeployed with the Drive scope (`driveupload` / `driveref`),
  and the new `/exec` is baked in as URL version 8 — which also unblocks the
  request form's Installation Report / KYC uploads. **Queued:** surface the link
  as a 📎 column in the Reports register and the call-view mini-table.
- **Reports history screen** — a fuller visit-history report beyond the call-view
  mini-table (the `/reports` screen covers the list; expand if needed).
- **Product Master gaps** — migration dropped City / State / Service Engineer;
  cascade prefill leaves those blank. Re-map from ProdMaster if needed.
- **Editable Registration Date on the single-call PM form?** (question).
- **Reporting field spec** — ✅ done. The Update Call form follows the agreed
  list: fetched call context (UC Number / Call Number / Call Type / Email-ID), a
  **Service Report** section in spec order, the three statuses (Solved - Report
  Completed / Unsolved / Solved - Report Pending), pending reason from the master
  (mandatory when Unsolved), Yes/No dropdowns for Add Consumption? (mandatory),
  Maintenance Done? (optional) and Recomended Filter Changed? (mandatory), a
  mandatory manual report on a completed call, Warranty Start Date on
  installations only, Accessory Serial No suggested from the party's CPX/ASU
  units, and Name / Contact Number / Designation on sign-off. Consumption lines
  stay editable (change part or quantity, delete) until the report is saved.
- **Rotate the Supabase secret key** — it was pasted in chat during setup.
- **Local `sheets.ts` fallback** — the Apps Script path remains as a fallback when
  Supabase isn't configured; retire once fully off sheets.

- **Customer feedback** — ✅ done. Mandatory on a solved call, with the **exact
  v2Feedback question set filtered by call type** (INSTALLATION-only, FIELD-only,
  PM/FIELD = not-installation, and all-types questions). Ratings use
  Excellent/Good/Average/Poor (`feedbackrating` master); "Advance PM Done?" is
  Yes/No, "Warranty Start Date?" a date, "Remarks" free text. Saved as a
  structured row to v2Feedback (identifying fields + answers + Call Type).

- **Masters in 200 All Masters** — ✅ loaded into `masters` and editable in All
  Masters (see Masters above). Each identified by its column header:
  - `complaint` → tab "Standard Complaint", col **"Complaint Name"** → Standard
    Complaint field on the call form.
  - `calltype` → col **"Call Type"** → Call Type select on the Request form
    (FIELD, INSTALLATION CALL, P M VISIT, SW UPGRADATION, FSCA, DEMO, ...).
  - `pendingreason` → col **"Call Pending Reason Name"** → the pending-reason
    field on the call report (Unsolved branch).
  - `cancelreason` → col **"Call Cancel Reason Name"** → the reason on the
    Hotline's **Cancel request** action (Pending Registrations).
  - `feedbackrating` → col **"Feedback"** → the rating answers on the feedback
    form.
  - `orapproval` → cols **"Approval Stage" / "Status" / "Reason for Approval /
    Rejection"** → the reason list behind a spare approval or rejection; not yet
    wired into the Spare Requests dialogs (the reasons are free text there).

---

## 📋 Queued (from the Service_CRM intent)

- **Spare module** — ✅ Phases 1–4 shipped, and **live on Supabase since
  2026-08-29** (applied with the `all.sql` bundle).
  - *Phase 1:* raise a Call-Based spare request from a call (📦 Spare /
    Request Spares); **Spare Requests** register lists one row per part with the
    approval/dispatch chain, role-scoped. Parts come from the `spare` master.
  - *Phase 2:* approval chain RM → Commercial → NSM → Stores (DC dispatch);
    Commercial + NSM auto-approve unless the item is AMC or OGP.
  - *Phase 3* (`0009_spare_receipt.sql`): engineer **acknowledgement** closes the
    loop (Dispatched → Received, raiser only); reject **reasons** and dispatch
    details (DC, courier, remarks) captured in confirmation dialogs; stage KPI
    tiles + stage chips with a **"Needs my action"** queue; a request **detail
    drawer** with every part and the full approval trail; new `spare.receive`
    permission. The migration extends `0008_rbac_enforcement.sql`'s stage guard
    to cover the receipt columns (the raiser holds no approval permission, so
    the guard would otherwise reject the acknowledgement) and grants
    `spare.receive` in `app_roles` additively.
  - *Phase 4* (`0011_spare_intake.sql`): the intake spec — OR NO / RowNo / OR
    Req Date assigned by the database, UCN picker, engineer selection, 20 parts
    per request — and Supabase-only writes (the `v2_ORReq-All` append is gone).
  - *Phase 4 fix* (`0012_spare_auto_approval.sql`): an RM approving a non-AMC
    item was **refused by the database**. `buildPatch` writes the Commercial and
    NSM auto-approvals in the same update as the RM's approval, and 0008's stage
    guard demanded permissions the RM does not hold — so the common path could
    not be approved at all. The guard now allows exactly that case; a manual
    approval still needs its own action and AMC/OGP still cannot be auto-cleared.
  - **Verified:** `supabase/tests/` applies every migration to a throwaway
    Postgres and exercises the triggers (12 scenarios: OR numbering from 47042,
    RowNo per OR, qty/20-part limits, the non-AMC fast path, receipt restricted
    to the raiser and to dispatched requests, the AMC review rule). It is what
    caught the 0012 bug — the build and the TypeScript tests could not see it.
    The harness runs as superuser, so it covers **triggers, not RLS policies**;
    the policies still want a check against the live project.
  - *Phase 5* (`0016_spare_line_approvals.sql`): **approvals moved from the
    request to the spare.** The RM decides each line on its own, so one OR can
    go forward partly approved. Every later stage reads the same per-line
    state, which is what lets it be actioned per spare *or* per OR (an "all N"
    button; the RM stage deliberately has none). The request keeps a rolled-up
    stage — the least-advanced surviving line — maintained by trigger, and the
    header's own approval columns are frozen so the two cannot disagree.
  - *Phase 6* (`0017_spare_or_number_monthly.sql`): OR numbers become
    **`OR-YYMM-NNNN`, restarting at 0001 each month** (a back-dated request is
    numbered in its own month). A per-month counter table replaces the single
    running sequence; numbers already issued keep the old `OR47042` form, since
    they are quoted on DCs and in Tally. `0018`/`0019` settled the shape on
    `OR-2608-0001`; the four-digit counter keeps the register sorting correctly.
  - *Phase 7* (`0022_spare_line_uid.sql`): **every spare has its own ID** —
    `<OR number>-<RowNo>`, e.g. `OR-2608-0001-01`. It leads the register, the RM
    approves against it and Stores dispatches against it, so two spares on one
    OR can be dispatched on different days with different DCs (the per-line
    columns for that have existed since 0016; this adds the reference to quote).
    Fixed once issued, unique across the register.
  - *Phase 9* (`0025_spare_dropped_stage.sql`,
    `scripts/import-spare-history.mjs`): the **26_SpareRequest history imports**
    — 4,088 requests and 8,480 spare lines back to June 2023, with the approval
    chain, stores status and SO number per line. Driven by `v2_OR_Req`, which
    carries every identifying field, so the **57 ORs missing from `v2_ORReq-All`
    still import in full**. Imported requests keep their original `OR43016`-style
    numbers; the monthly `OR-YYMM-NNNN` counter is untouched, since its seeding
    only matches the new format. Each imported spare gets its own ID
    (`OR43016-01`) from the existing trigger.
    New terminal **Dropped** stage for a spare Stores did not send — distinct
    from Rejected (254 of the 272 had the RM's approval first), and it no longer
    holds its request open.
    ⚠️ **8 lines are both RM-Rejected and Stores-Dropped**; the derivation calls
    those Rejected — the approver's decision closed the line — where the sheet's
    own Status column said Dropped. Every other line matches the sheet exactly
    (8,033 Dispatched, 35 Stores, 15 RM, 6 Commercial). One-line change in
    `spare_line_stage()` if the sheet should win instead.
    The CSVs stay out of git (`migration-data/*.csv` is ignored) — customer data.
  - *Phase 17* (`0041_stock_read_scope.sql`): **the stock screens follow the
    reporting tree too** — Hand Stock, Stock Transfer, Material Returns.
    Two gaps after 0040 scoped the spare register:
    • `engineer_stock` was **not** `security_invoker`, so it ran with the
      view owner's rights and bypassed RLS entirely. `listAllStock()` feeds
      the Stock Transfer screen from it, so any signed-in user could read
      every engineer's stock level whatever the table policies said. Now
      invoker-rights. `engineer_stock_available()` is SECURITY DEFINER, so the
      overdraw guard still counts every movement — verified, it still sees
      another team's 6 valves.
    • `st_read` tested `is_admin()` alone, so the office desks could not see
      transfers at all; now `can_view_all_calls()`, as everywhere else.
    Hand Stock and Material Returns needed no policy of their own:
    `handstock_balance` / `handstock_movements` are already security_invoker
    and inherit, and `mr_read` (0039) already reads this way.
    "View as" is a client-side identity — the query still runs under the
    administrator's own session, so RLS cannot scope a preview. The same
    `previewScoped()` filter #75 gave Spare Requests now narrows Hand Stock
    (levels + movements), Stock Transfer (stock + transfers; a transfer counts
    if either side is in scope) and Material Returns while a preview is
    active, and is a no-op in a real session. `src/lib/access.ts`.
    **Merged (#76). Still to run on the live project: `HandStock_X.sql`**
    (carries `0041`) — the stock-side scoping is not in force until it is.
    ⚠️ **Two re-run breaks found on `main`, both pre-existing and left alone**
    (verified by stashing this branch's changes and reproducing):
    `all.sql` is no longer idempotent — `0040_call_tables_split.sql` turns
    `calls` into a view, so a second pass dies at base's `create index ... on
    public.calls`; and `HandStock_X.sql` re-run dies with *cannot drop columns
    from view*, because a later migration widens `handstock_balance` and
    re-running 0023 tries to narrow it back. First runs are clean and live
    databases are unaffected, but the "bundles are idempotent" guarantee is
    broken in both. They belong to the call and material-returns work.
  - *Phase 15* (`0032_stores_sees_pending_dispatch.sql`): **Stores Incharge
    could not open Pending Dispatch.** 0027 granted `mod:/spare-dispatch` only
    to roles whose stored list already held `spare.dispatch` — one condition
    too many, since a role's list is editable in Roles & Permissions, so any
    role re-saved or trimmed came out of that migration without the screen
    while still being the role that dispatches.
    Granted by ROLE now as well (the way `0020_stock_transfer.sql` does it),
    OR'd with the action, plus the spare register so Stores can see what is
    coming. Every clause appends only, so an admin's other edits survive.
    ⚠️ **The wider trap:** `0008_rbac_enforcement.sql` seeds each role with a
    HARD-CODED module list, and a stored `app_roles` row wins outright over the
    client defaults (`permsForRole`). So **every new module is invisible to
    every role until a migration grants it** — this has now bitten for
    handstock (0023), stock transfer (0020) and dispatch (0027/0032). Worth
    making the grant part of adding a module rather than a follow-up fix.
  - *Phase 14* (`0031_pending_dispatch_live_stage.sql`): **the dispatch queue
    computes the stage instead of trusting the column.**
    Reported symptom: Spare Requests showed three spares at Stores while
    Pending Dispatch was empty. The two screens were asking different
    questions — the register derives the stage in the app from the approval
    columns (`deriveStage`), the queue filtered on `spare_request_lines.stage`,
    which is a trigger-maintained CACHE of that same derivation. Any write that
    does not refresh it (a load with triggers off, a row last written before
    0016/0025 changed the rule) leaves the two disagreeing, and the spare is
    invisible to Stores while looking perfectly normal in the register.
    The view now applies `spare_line_stage()` to the columns. The cached column
    is repaired for every line as well, since the register's chips and tiles
    and the header roll-up still read it.
    Reproduced first: with the stored stage forced to 'Commercial' behind the
    trigger's back, the queue returned 0 rows before and all 3 after — kept as
    step 12 of `spare_dispatch_test.sql`.
  - *Phase 13* (`0029_engineer_address.sql`): **the Declaration form**
    (`/declaration/<stock out>`) — the template's second sheet, the paper that
    travels with the parcel. Same printing as the challan: A4, narrow margins,
    one complete `<section>` per sheet (18 rows, the sheet's own grid), so the
    heading and the sender block are on every page.
    Three things the form needs and the app did not have, each settled where it
    belongs:
    • **the address** — from the **User Master**: `user_directory` gains
      `address` / `city` / `state` / `phone`. The sheet always had those
      columns and the User Master screen already showed City/State/Contact, but
      the table never carried them, so on Supabase they were blank. Now read,
      shown (Address added to the screen), imported, and **lifted out of
      `extra`** for a directory imported before they were columns.
    • **the approximate value** — typed per parcel. The form says approximate,
      and `parts` carries no price at all.
    • **the purpose sentence** — the sheet's COVID-era wording is the default
      and is editable.
    Dispatch may correct the four address fields from the form and save them
    back to the User Master; a guard refuses every other column from a
    non-admin, so the reporting tree cannot be edited through that door.
    **Split across two migrations, on purpose.** `0029` is the four columns and
    the `extra` backfill, and ships in the **User Directory** bundle where the
    User Master lives. `0030_engineer_address_write.sql` is only the rule about
    writing them, and ships with **RBAC**, because its policy calls
    `has_perm()` — which RBAC defines and which applies after the directory.
    (Both were first put in the RBAC bundle, which worked but hid a User Master
    column change inside "Roles & Permissions". Bundle ORDER is the constraint,
    and it has now bitten twice: a new object may only reference what its own
    module already depends on. Splitting the migration, rather than moving it,
    is the way out.)
    `0029` drops the write guard around its backfill and puts it back only if
    it exists, so it is safe both on a first run (no guard yet) and re-run
    after `0030` (guard restored) — verified by applying the bundles out of
    order and checking the trigger is still installed.
  - *Phase 12* (`0028_dc_number_is_stock_out.sql`): **the Delivery Challan
    prints** (`/dc/<stock out>`), laid out from `v2_DCTemplate.xlsx`.
    A4, narrow margins (0.25in sides, 0.75in top/bottom), and the letterhead
    AND the signature block on **every** sheet.
    That last part decided the implementation. Two browser mechanisms were
    tried and both fail: a table's `<thead>` repeats, but Chromium prints
    `<tfoot>` only on the LAST page; and a `position: fixed` footer repeats but
    reserves no space, so it paints over the final rows (both reproduced, and
    the second one confirmed in a printed PDF). So the pages are cut in code —
    `paginate()` in `src/lib/dc.ts` — one complete `<section>` per sheet,
    20 rows each, which is exactly the template's own grid and exactly what
    fits: a sheet measures ~250mm against 259mm of usable A4.
    Verified by printing through headless Chromium: 1/6/20 spares → 1 sheet,
    21/40 → 2, 41/45/60 → 3, with the letterhead and both signature blocks on
    every page and no row hidden.
    **One number, not two.** 0027 minted an SO- and a DC- series on the
    assumption the challan had its own number. The template says otherwise —
    it identifies the delivery by **Stock Out No.** and has no DC field — and
    so does the sheet era, whose `SO NO` column is what the import loaded into
    `dc_number`. `dc_number` now mirrors the stock out, every existing read
    (hand stock's movement ref, the trail, the register, the history) keeps
    working, and `next_dc_number()` is retired. If a distinct challan series is
    ever wanted, `spare_dispatches_assign_no()` is the one place it comes back.
    ⚠️ **Still to do:** the workbook's second sheet, the **Declaration form**
    (for the courier), is not built — it needs a recipient name and address and
    an approximate value, none of which the app holds. Ask where those come
    from before building it.
  - *Phase 11* (`0027_spare_dispatch.sql`): **Pending Dispatch** — the Stores
    queue as a screen of its own (`/spare-dispatch`), grouped by engineer,
    longest wait first. Multi-select within a group (or tick the whole
    engineer) and book the lot out in ONE stock out.
    New `spare_dispatches` header, one row per stock out, carrying the
    generated **SO-YYMM-NNNN** and **DC-YYMM-NNNN** numbers, the engineer, the
    courier and the DC date; `spare_request_lines` gains `dispatch_uid` /
    `stock_out_no` and keeps `dc_number`, so hand stock, the trail and the
    imported history all still read.
    `dispatch_spare_lines()` does the batch atomically and enforces what the
    screen promises — the caller holds `spare.dispatch`, every line is still
    waiting at Stores, and the whole batch goes to one engineer (a DC is one
    delivery to one person).
    Numbering is the OR/ST upsert counter, so concurrent dispatchers cannot
    collide. ⚠️ **The DC format is still to be confirmed** — it is produced in
    exactly one place, `next_dc_number()`, so changing it is a one-function
    change. A DC *document* (the printable challan) is not built yet, pending
    that format.
    Dispatch was removed from the register's own modal: there is now one way
    to book stock out, so nobody types a DC number by hand. The register's
    Stores action links to that engineer's queue instead.
    No change was needed for hand stock or the call-report picker: `0023`
    already counts a spare from the DISPATCH, not the acknowledgement, so a
    booked-out spare is in the engineer's hand stock — and therefore in the
    consumption picker — immediately.
  - *Phase 10* (`0026_spare_approval_data.sql`): **Commercial and NSM answer
    their own forms**, transcribed from the two Google Forms.
    Commercial branches — status → clearing reason → MC/SA number *or* the
    four-step Direct PO checklist, or a pending reason. NSM is flat — status,
    multi-select reasons with an *Other*, remarks.
    Answers live in `spare_request_lines.approval_data` as jsonb keyed by
    stage, so a form can change without a migration; the decision itself stays
    in the columns the workflow reads, so stage derivation is untouched.
    A separate trigger gates each stage's answer by that stage's permission.
    **New third outcome:** "Admin Process in Progress" / "Put on HOLD" record
    *why* without approving, so the spare stays in that stage's queue —
    previously Commercial and NSM could only approve or reject.
    **Resolved (asked and answered):** the clearing reasons include Under CMC
    and Under Warranty while `needsReview()` routes only AMC and OGP items to
    Commercial — which looked like a mismatch, and is not. **Contract entry
    lags reality:** a machine whose CMC or warranty has not been keyed in yet
    still reads as OGP, so it lands with Commercial, who clears it as *Under
    CMC* / *Under Warranty*. Those reasons are how Commercial records that the
    system is behind the contract. Routing stays AMC + OGP; the form keeps all
    five reasons. Do not "fix" either one.
  - *Phase 8* (`0023_handstock.sql`): **Hand Stock** (`/handstock`) — the stock
    level an engineer is carrying, per spare:
    **stock out (Stores) − consumption − transfer out + transfer in**.
    Two tabs: **Stock Level**, one line per engineer and spare with every term
    as its own column (in-hand / short / settled filters, per-engineer filter,
    search, CSV, and a per-line movement trail in a drawer); and
    **Movements**, the ledger those levels are made of — every stock out,
    consumption and transfer, newest first, filtered by kind and engineer,
    paged and exportable.
    It does **not** add a second stock system: `0020_stock_transfer.sql` owns
    the transfer tables and the `/stock-transfer` screen, and `engineer_stock`
    — which that screen and its overdraw guard read — is redefined as a view
    over `handstock_balance`, so the two can never disagree.
    That consolidation fixed two ways a balance was wrong: only
    `req_type = 'HandStock'` requests counted as stock in, so a spare
    dispatched against a **call** was consumed out of a balance it had never
    been added to (engineer goes negative, transfers refused); and a dispatch
    carrying a DC but **no `dispatched_at`** — sheet-era rows, imports —
    counted for nothing. Stock out is now every dispatched line, decided by the
    *status*, dated by the best timestamp the row has.
    **Reporting → Spare consumption offers only what that engineer holds**,
    with the quantity in hand, and refuses more — so a report can no longer
    consume a spare nobody issued.
    Movements are matched on the engineer's **name** (case- and
    space-insensitive) and the part **CODE**; consumption never carried an
    email, so the report form now writes one for future rows.
    Requirements are written up in **`HandStock_Req.md`** (repo root), numbered
    HS-1…HS-40 with the check that proves each one.
    A **negative** level is shown, not hidden. `supabase/tests/handstock_test.sql`
    covers it, and `stock_transfer_test.sql` still passes against the
    redefined view.
  - **Next:** warehouse-side stock — the *Stores* balance, decremented on
    dispatch (needs `parts.on_hand`/price columns first; the ITEM Master import
    carries only code, description and Active) and a stores pick/pack view.
    Engineer-side stock is now live, so consumption reconciliation is a filter
    over it (a spare still in hand long after the call closed). A transfer is
    deliberately immediate — if hand-overs need the receiving engineer to
    accept them, that is an acknowledgement step on `stock_transfers`. Also worth a smoke test
    on the live project now that the migrations are applied: raise a request,
    approve it as RM, dispatch it, acknowledge it — the RLS paths (`sr_update`,
    the new `sr_delete`) are the part the trigger harness cannot cover.
- **Stock Transfer** — ✅ shipped (`0020_stock_transfer.sql`). Engineer-to-engineer
  hand-stock transfers, numbered `ST-YYMM-NNNN`. **Stock is derived, not stored:**
  the `engineer_stock` view sums hand-stock dispatched to an engineer, less
  consumption, plus/minus transfers — so a balance cannot drift from its history.
  A transfer only offers parts the sender holds and caps the qty at what is
  left, enforced by trigger as well as in the form (an AFTER trigger, so a
  multi-row insert that individually passes but together over-draws is caught).
  **Note:** inflow keys off *dispatch*, not the engineer's acknowledgement —
  acknowledgement needs `spare.receive`, which the role defaults no longer give
  engineers, so keying off it would leave every balance at zero.
  **Next:** store-level stock (this is engineer hand-stock only), and stock
  decrement straight from a Call-Based dispatch.
- **v2Consumption / v2Feedback** — ✅ fixed. They are standalone spreadsheets
  (`consumption` = `1j1IHT3P…dG7o`, `feedback` = `1Mi-b-JY…nqXc`), now wired as
  their own books; the report-time spare-consumption / feedback saves target
  each book's primary sheet (a tab whose name contains "consumption"/"feedback",
  else the first sheet). Links editable in Admin Config. Confirm the landing tab
  after redeploy; if it isn't the intended one, name it and I'll pin it.
- Link remaining masters to call registration (Contract Entry, Warranty Sale
  Entry) — ✅ the registers now own both, and a machine row registers a field
  call directly. ITEM Master is done — it backs Part Master, the spare-request picker
  and the in-call consumption picker; "200 All Masters" is done — every list is
  a maintained table in All Masters.
- **Next on masters:** point the Spare Requests approve/reject dialogs at the
  `orapproval` list instead of free-text reasons.
- Preventive Maintenance (PM) schedule/calls.
- Sale Entry, Reports, Dashboard/KPI, Indoor Activity, other misc (to be placed).

---

## 🚀 Before go-live

- **Clear all data and re-upload fresh from the sheet CSVs.** Everything in
  Supabase today is migration/test data loaded while the modules were being
  built (plus whatever the demo seed left behind). Before go-live, purge the
  data tables and re-import a clean export of every sheet in one pass through
  **Bulk Data Import**, so the live system starts from the sheet as the single
  source of truth.
  - **Purge, then load in dependency order:** masters / value lists → parties →
    products → parts (ITEM Master) → user directory → calls (FIELD + INST + PM)
    → reports (per-visit) → spare requests + lines → consumption → feedback →
    call requests → stock transfers + lines. Children reference parents, so the
    order matters. **Hand Stock needs nothing of its own** — a balance is
    derived (stock out − consumption − transfer out + transfer in), and
    `engineer_stock` is a view over it, so both come back correct once the
    ledgers underneath are loaded.
  - **Keep, do not purge:** Supabase Auth users, `profiles`, `app_roles` /
    Roles & Permissions, per-user extra access, saved table views, and Admin
    Config. Those are configuration, not data.
  - **Reset the counters after loading** so new records continue the series
    rather than colliding with the imported rows: the UCN counters (F / I / PM);
    the **Call Number** running number (`0015_call_number.sql`, `CLYY#####`,
    seeded from the existing series); `next_call_reqid()` for REQID; and the
    **OR NO** per-month counter table (`0017`–`0019`, `OR-YYMM-NNNN` restarting
    at 0001 each month) — a fresh load of historical spares must not leave the
    current month's counter behind the numbers it just imported — and
    `stock_transfer_counters` (`0020`) for the same reason. Spare line UIDs
    (`0022`, `<OR number>-<RowNo>`) follow the OR number, so they need no
    counter of their own.
  - **Verify against the sheet before opening it up:** row counts per table,
    a spot-check of back-dated `reg_date` values, call status derivation
    (`call_state`), and that role scoping still resolves — it matches on exact
    `User Name` ⇄ `Call Allocated To` strings.
  - Needs a repeatable purge path (a `supabase/apply/` reset bundle, or a
    documented SQL snippet) rather than deleting tables by hand — it will
    likely be run more than once during the dry run.

---

## 🩺 Daily Call Review (DCCR) — shipped 2026-08-31

- The module is live: three review stages, the derived Any Potential Effect /
  Action Taken / Review Status, the two per-product masters, and the export in
  the register's own 38-column format.
- **PENDING — SQL to run on the live project.** Run `supabase/apply/_status.sql`
  first; it now reports `daily_review (DCCR)` and `daily_review: values`. If
  either says NO, run **`supabase/apply/daily_review.sql`** (0044 + 0046 + 0047).
  Until it is applied the module reads nothing — `field_call_review` does not
  exist. **Re-run it after 0047** even if the earlier parts are already in: 0047
  adds the report context, the age banding and — importantly — the indexes that
  keep the register fast.
- The register opens on the **last 30 days** and reads a page (500) at a time,
  with every filter applied by the database. It has to: the per-call report
  lookups run for every row a query returns, so pulling the whole register at
  once cost ~13.7 s per page on 25k calls / 50k visits and showed nothing until
  the last page landed (which is what "it is hanging" was). With
  `field_calls_reg_date_idx` a page is ~0.25 s. If the register ever feels slow
  again, check that index exists before anything else.
- **Visits and consumption map to a call by CALL NUMBER**, not UCN (0048). The
  Field Call view's own panels do the same (`reportsByCall` /
  `spareConsumptionByCall` both filter on `call_number`), and rows from the
  register may carry no UCN at all. The view matches on either key, with blank
  keys excluded so an empty `call_number` cannot sweep in every other blank one.
  Anything else that joins reports or consumption to a call should follow suit.
- `supabase/tests/_stub.sql` now sets Supabase's own default privileges
  (`authenticated`/`anon` get blanket DML on `public`, RLS being the gate).
  Without it a suite that runs `set local role authenticated` fails on
  "permission denied for table reports" — an artefact of the harness that says
  nothing about the policy under test.
- The stage counters read `field_call_review_summary` — the same register
  WITHOUT the report lookups — so counting a year of calls is ~25 ms rather
  than ~3 s. Keep new filterable columns on both views.
- The seed carries the register's own master values (707 groupings, 657 root
  cause key words, tagged MONNAL T60 / MONNAL T75 / COMM). Source CSVs are kept
  in `migration-data/dccr/` so the seed can be regenerated.
- `review.edit` is granted by the migration to admin, hotline, nsm, rgm, rm and
  commercial. Confirm the matrix in Roles & Permissions matches what the team
  wants — nobody else can complete a review, though everyone who can open the
  module reads it.
- Historic reviews are **not** imported. The register's own 3,850 reviewed calls
  for 2026 still live in the workbook; if they should be carried over, that is a
  one-off load into `call_reviews` keyed by UCN (the DCCR export format is the
  same shape, so it maps column for column).
- Review 1 is answered on the Call Registration form. A call registered before
  those three questions were mandatory reads as **Review 1 Pending** — it is
  completed by editing the call, not from this module.

---

## 🔧 Operational notes / blockers

- ⚠️ **`notify_spare_dispatched()` (0045_notifications.sql, on `main`) is broken
  and takes spare dispatch down with it.** It declares a local `uid` and then
  does `select ... from public.spare_requests where uid = new.request_uid`, so
  Postgres raises *“column reference "uid" is ambiguous”* — and because the
  trigger fires on the dispatch write, **the dispatch itself fails**. Reproduced
  on PG16: `spare_stock_scope`, `handstock`, `spare_workflow` and
  `stock_transfer` all now fail at their dispatch steps, and they pass on the
  commit before notifications landed. Fix is one line — rename the variable
  (e.g. `v_uid`) or qualify the column (`where spare_requests.uid = ...`).
  NOT fixed here: it is nothing to do with the daily review, and it deserves
  its own change so it can be verified on its own.

- **Redeploy CallReg** after backend changes, re-authorising the Drive scope,
  and send the new /exec URL so the baked-in default can be bumped. Done for the
  upload endpoints (`driveupload` / `driveref`) — URL version **8**, 2026-08-29.
- **v2Consumption / v2Feedback** are read as tabs of the Call Register spreadsheet
  by default; if they live elsewhere set `cfg_consumption` / `cfg_feedback` or
  share the sheet.
- ⚠️ **A merge on main reverted four modules** (2026-08-29). The audit-log
  branch was cut from a much older tree, and merging it took its stale hunks:
  `SpareRequests.tsx` lost per-spare approvals (leaving calls to `wfButtons` /
  `runPending` that no longer existed), `FieldCalls.tsx` lost `StateBadge`,
  `RequestCallRegistration.tsx` lost its product rows, `UserAccess.tsx` lost
  `sbSendPasswordReset`. **`npm run build` failed on main**, so the Pages
  deploy was broken too. Repaired here by restoring each file from the commit
  before that merge and re-applying the audit calls on top. Worth checking a
  long-lived branch against main before merging it.
- `0009_audit_log.sql` arrived with no apply bundle, which the generator's
  coverage check refuses (rightly) — it now has one (`supabase/apply/audit.sql`),
  and `_status.sql` reports it.
- Role/visibility matching relies on exact `User Name` ⇄ `Call Allocated To`
  strings (case/space-insensitive). Flag any spelling mismatches.
- **`supabase/apply/all.sql` is not re-runnable** (the per-module bundles are).
  On a second run `0012_call_state.sql` recreates `pending_calls` as
  `select c.*, s.state as open_state`, and by then `0014` has added a real
  `open_state` column to `calls` — so the view has the name twice and the
  bundle stops with *“column open_state of relation pending_calls already
  exists”*. Pre-existing, harmless on a first apply; fix by qualifying that
  select when `0012` is next touched.
- **`CallReporting.tsx` was missing its `uploadToDrive` / `MAX_UPLOAD_BYTES`
  import** — `npm run build` failed on the branch tip. Import added.
