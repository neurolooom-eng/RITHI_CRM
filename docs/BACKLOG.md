# RITHI CRM — Backlog

Living backlog for the Field Service module. Newest decisions at the top of each
section. Shipped items also appear in the in-app **Version History**; this file
tracks what's **done**, **in progress**, and **queued**.

_Last updated: 2026-09-15 (rows 150-153 all applied: the Part Master rename,
Change product?, frequent-failure rule 2 and the User Master role sync)_

_Previously: 2026-09-06 (bundle replay safety; see the top of In progress) ·
2026-09-02 (spare reconciliation shipped and applied; live project fully caught
up)_

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
- **Deploy the daily digest** — the Edge Function + schedule are in the repo
  (`supabase/functions/daily-digest/`, built, not deployable from here). Needs a
  **Resend API key** and the Supabase **CLI** deploy: set the secrets,
  `supabase functions deploy daily-digest --no-verify-jwt`, then run
  `schedule_daily_digest.sql`. Steps in `daily-digest-DEPLOY.md`.
- **RBAC view-matrix** — the user will send a matrix of role × module × level
  (who can view/create/edit/approve/export what). Translate it into the role
  defaults in `src/lib/rbac.ts` **and** a `set` SQL that writes the same
  permissions into `app_roles` (live roles are populated, so a code change alone
  is not enough — a DB grant is required).

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
