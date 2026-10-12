# Moving RITHI to Zoho Creator — build sheet, part 1

**Scope of this part: Masters, Product Database, Calls, Spares** (the user,
2026-10-12: *"Start with Calls, Spare, Product Database, Masters"*). Everything
else (Cover registers beyond what Product Database needs, Indoor Service,
Quality, Reports, Admin) is a later part.

**Status: DRAFT, derived from the repository on 2026-10-12.** Every fact below
was read from the files named beside it — `docs/DATABASE_SCHEMA.md` (generated
from the migrations), the migrations themselves, `src/lib/uploads.ts`,
`src/lib/rbac.ts`, `docs/CAPABILITY_INVENTORY.md`, `docs/HOW_TO_USE.md`,
`docs/CALL_REQUEST_REQUIREMENTS.md` and `docs/COVER_REQUIREMENTS.md`. Where two
of those disagree the migration is the fact and it is said so. Nothing here was
checked against Zoho Creator's current limits; the section at the end lists
what must be verified in Zoho's own documentation before building.

This is a REBUILD, not a conversion. Nothing imports a Postgres schema with
triggers and row-level security into Creator. The data moves in one cutover at
the end; the forms, rules and permissions are built by hand from this sheet,
and the acceptance tests come from `docs/REQUIREMENTS.md`.

---

## 0. Before building anything

### 0.1 Getting the data out

The application already has the export: **Data Export** (`/data-export`) gives
one CSV per table in a ZIP, with the five `sys_*` columns on every row. It runs
AS THE SIGNED-IN USER, so the login matters:

- Sign in as the **Zoho Migration** role (`0155_zoho_migration_role.sql`). It
  exists for exactly this: a read-only twin of Technical Support that sees
  every module and every record (`data.view_all`, `export.data`) and holds no
  write permission, so what it does here is readable in the audit log and
  revoking it is one tick when the migration ends.
- Export the tables in the load order of §1, not alphabetically; the ZIP is one
  file per table either way.
- Row counts beside each table on that screen are the database's estimates.
  Reconcile the real counts after loading with `select count(*)` in the SQL
  editor, per table, and keep that list — it is the acceptance count for §8.

### 0.2 Three decisions that must be made BEFORE the first form

These are places where the database's design will not carry across and a
Creator-shaped choice has to be made once, up front, because every later form
depends on it.

1. **Records are linked by NAME here; link them by RECORD in Creator.**
   There are 69 foreign keys in the schema and almost none of them join
   business tables: a call names its machine by `product_name` + `serial`, its
   customer by `party_name`, its engineer by `allocated_to` (a NAME matched
   against the User Master), a spare line names its part by `item_detail`, and
   the reporting tree on the User Master is `reporting_manager` as free text.
   The project has paid for this repeatedly (renames carried by trigger across
   fourteen tables, a blank manager name once matching everyone with no
   manager). In Creator use **Lookup fields to the master record** for party,
   machine, part and person, and keep the name as a plain text column beside
   the lookup ONLY where the import cannot resolve it (see 0.3).
2. **Machine identity is PRODUCT + SERIAL, never serial alone.** The install
   base's unique key is `machine_key = lower(trim(product))|lower(trim(serial))`
   (0079/0081); eleven machines share serial 219. The one place the code still
   keys on serial alone (`machine_cover`, and the transfer form's fill-in of
   `from_party`) is recorded as a gap (CW-001, CW-003). Build the Machine form
   with a unique composite of Product Line + Serial and do not offer a
   serial-only lookup anywhere.
3. **Numbers the database mints must be minted by Creator, in the same
   format, continuing the series.** Five series: UCN, call number, REQID, Party
   key, and the spare series (OR number, DC number, MRN, transfer number).
   Formats are in each section. The counters restart (UCN per day per type) or
   continue (Party-N) and the first number after cutover must follow the last
   one exported — seed each counter from the export before go-live.

### 0.3 Orphans the import will meet

Because links are by name, the export contains rows whose link resolves to
nothing. They are legitimate data and the import must not drop them:

- `reports.ucn` has no foreign key: a visit can name a UCN no call carries
  (`_why_do_the_two_report_counts_differ.sql` names them on live data).
- `products` rows with a serial and a blank product name; `machine_cover` lists
  them and Product Database 2.0 cannot (`_why_is_product_database_2_empty.sql`).
- Calls allotted to an engineer whose directory row has since been renamed or
  removed; spares whose part was retired (`parts.active = false`, never deleted).

Rule: a lookup that resolves gets the lookup; one that does not keeps the
exported text in the plain column and is listed in an **"Unresolved links"**
report per form so somebody fixes the master rather than the import inventing
one.

---

## 1. Build order and load order

Each layer is looked up by the next, so build and load in this order. The
"needs first" column is the dependency the Bulk Upload registers already
enforce (`requires:` in `uploads.ts`), carried over.

| # | Group | Forms (Creator) | Needs first |
|---|---|---|---|
| 1 | Masters | Party, Part, Person (User Master), Product Line, Value Lists | — |
| 2 | Product Database | Machine (install base), Sale Entry + Sale Item, Contract Entry + Contract Item, Ownership Transfer, Additional Entry, Installation Warranty Start | Party, Product Line, Person |
| 3 | Calls | Call Request, Field Call, Installation Call, PM Call, Visit, DCCR Review | Machine, Party, Person, value lists |
| 4 | Spares | Spare Request + Lines, Dispatch + Lines, Consumption, Hand Stock Opening / Adjustment, Material Return, Stock Transfer + Lines | Call, Part, Person |

Load the Masters first, then the four cover registers, and only then run the
Machine import — in this database the `products` row is largely WRITTEN BY
TRIGGERS from the sale, contract, transfer and installation registers
(`sync_product_machine`, §3.3), so loading the registers first and letting
Creator's equivalent workflow fill the Machine form reproduces the live rows;
loading `products.csv` first and the registers after would overwrite them in
the wrong order.

---

## 2. MASTERS

Screens: Party Master, Part Master, Part Search, User Master, All Masters,
Product Master (product lines — built here, used in §3). Permission keys are in
§6.

### 2.1 Party (from `parties`)

**Key.** Unique on the trimmed, case-folded party name (`name_key`). Also a
system-minted `party_key` = `Party-<n>` from a single-row counter
(`party_key_seq`), minted AFTER insert so an update never burns a number. In
Creator: Party Name unique (case-insensitive), Party Key as an auto-number with
prefix `Party-` seeded from the highest exported value.

**Fields.** Name; Type (CUSTOMER / DEALER — a DEALER is what the install call
refuses and the transfer form's `sold_through` reads); Profile (PRIVATE /
GOVERNMENT / DEALER / GENERAL); City, State, Country, Route; Installation
address block (address, pincode, phone, phone 2, fax, email); Billing address
block (the same six); Serviceman (`service_engineer`, a Person — prefills "Call
Allocated To" when the machine has no engineer of its own); GSTIN (15), PAN
(10); KYC status, notes, verified by/at, KYC documents (list of
{name,url,at,by}).

**Only CHECK in this group:** `kyc_status` ∈ '' / Pending / Verified /
Rejected, default Pending (0201). Everything else on this form is a maintained
list, not enforced.

**Rules to rebuild as workflows.**
- On create, blank KYC status → Pending; a blank GSTIN/PAN is filled from the
  export's Tax 1/2/3 columns and the PAN from GSTIN chars 3–12; a typed value is
  never overwritten (0201/0290). DERIVES.
- KYC status moving to Verified stamps verified-by/at from the session and
  clears them when it moves off Verified. STAMPS. Changing it needs
  `masters.edit.kyc`. REFUSES.
- **The name is immutable from the UI** (0335): no party-rename function
  exists; only an importer may change the key. In Creator: Party Name read-only
  after create except for the migration profile.
- **Delete refused while anything names the party** (0325/0350): machines,
  calls, requests, sales, contracts, transfers, additional entries, feedback,
  spare requests, consumption history, indoor jobs, DCs, FFRs, material
  returns. In Creator this becomes a "Retire" action; Creator's own delete
  stays disabled on this form.
- "Change engineer" bulk swap (`swap_service_engineer`, needs
  `masters.edit.swap_serviceman`): rewrites Serviceman on every party holding
  the old one. A Creator custom function.

**Load.** `parties.csv`, conflict on name. Upload aliases (`uploads.ts:1317`)
show which exported headings mean what; the second occurrence of a heading
(`tel 1 [2]`) is the billing copy.

### 2.2 Part (from `parts`)

**Key.** Unique on `item_detail` = `CODE|Description`, case-folded — NOT on
code: the same code (YR134500) is two different parts. In Creator: Item Detail
unique; Code is searchable, not unique.

**Fields.** Code, Description, Item Detail, Active, Category (Spare /
Consumable / Product / Labour / other — DELIBERATELY no fixed list, 0152: a
constraint aborted a bulk import halfway), Product family (blank = Common),
Purchase cost (+ foreign), HSN code, IND/IMP (Indigenous / Imported / TBD), Labour
charge (bool: booked at qty 1, never hand stock, 0413), source added/modified/
inactive dates.

**Rules.**
- A part is RETIRED (`active=false`), never deleted on screen; delete refused
  while any spare line, dispatch, consumption, opening, adjustment, transfer,
  return or indoor job names it (0350).
- **Rename only through `rename_part(id, code, desc)`** (0196/0309): refuses
  `|` in either value and a merge into an existing key; rewrites `part` in ten
  tables in one transaction. With record lookups (0.2 #1) this trigger
  disappears — the rename is one edit on the Part record — which is the single
  largest simplification the move buys.
- Part Search (`/part-search`) is a read-only report over active parts, four
  columns, no export.

**Load.** `parts.csv`, conflict on Item Detail.

### 2.3 Person (from `user_directory`, `profiles`, `user_profile`, `user_rr`)

Two tables carry a person here and Creator needs one form plus Zoho's own user:

- `user_directory` is **every person, signed in or not** — the one the calls
  are allotted to and the reporting tree is built from. **It has NO natural
  key** (BACKLOG, D-071): nothing stops the same person twice, and the legacy
  importer plain-inserts. Give the Creator Person form a unique Employee Code
  (the `user_profile.employee_code` that already exists, unique where set) or
  email, and de-duplicate the export BEFORE loading — a duplicate here
  duplicates the team tree.
- `profiles` is one row per LOGIN (Supabase Auth). It becomes the Zoho user
  account; the Person record carries a Zoho User field linking to it.

**Fields (Person).** Name; Email; Gmail; Designation; Reporting Manager and
Regional Manager (**NAMES as free text here — make both Lookups to Person**,
0.2 #1); Region; Active (`validity`); Address/City/State/Phone; Role (an
`app_roles` key — becomes the Creator profile, §6); Department (value list);
Tags (list; "CAPA Responsibility" puts the person on the FFR CAPA list);
Employee code; Joining date; Roles & Responsibilities documents (one per
period: title, URL, effective from/to with to ≥ from; a new period closes the
previous one the day before it starts).

**Rules.**
- Role may only be set by `users.manage.access`; a person may never change
  their own role or permissions (0286).
- A rename is carried across fourteen tables by trigger (0257/0259/0346). With
  lookups this is unnecessary; keep ONE rule — a rename must not silently merge
  two people (the trigger refuses when another row still has the old name).
- A login with NO Person row gets **no permissions at all** (0300, D-074):
  `has_perm()` answers FALSE, not the engineer defaults. Creator: a Zoho user
  with no Person record is assigned a profile with no access.

**Team visibility (`visible_engineer_names()`, 0212).** The rule every
"my team's records" filter uses: the caller's Person row (matched by login
email, else by name), plus every Person whose Reporting Manager OR Regional
Manager is a Person already in the set, repeated downwards; a node with a blank
name stops the walk. In Creator there is no recursive query, so store it:
**a "Visible to" multi-lookup on Person maintained by a workflow** that runs
when a manager field changes and rebuilds the set for the subtree. Every
scoped report then filters `Allotted to ∈ visible-to(current user)`.

**Load.** `user_directory.csv` + `user_profile.csv` + `user_rr.csv`; map
Reporting/Regional Manager names to Person records after the load (two-pass:
load people, then resolve managers), and list the unresolved names.

### 2.4 Product Line (from `product_master`)

**Key.** `product_code` (PK, immutable from the UI, 0335). 53 rows.
**Fields.** Name, Item detail (`CODE|NAME`), Item type (PRODUCT /
PRODUCT-ALLIED), Category, Short form, Active, Imported (NULL = unknown; decides
whether a DEMO unit owes Pre-Delivery Testing), added on/by.
**Rules.** `active=false` stops EXACTLY ONE thing — a NEW sale entry — and is
enforced on the sale form's picker, NOT by a trigger, because 30 of the 53
lines are retired and their historical sales really happened (0193). An
UNKNOWN code is sellable. Delete refused while a machine, sale line or contract
line names the code.
**Load.** `product_master.csv`, conflict on code.

### 2.5 Value lists (from `master_lists` + `masters`)

One registry row per list, values in `masters` keyed `(name, value, stage,
product)`; deactivated values stay on records but are no longer offered.
**None of these is enforced by the database** — only the forms restrict input
to the list. In Creator they are Lookup fields to a Value List form (so they
can be maintained on screen) rather than static dropdowns.

| key | label | used by |
|---|---|---|
| calltype | Call Type | call forms (FIELD, INSTALLATION CALL, P M VISIT, SW UPGRADATION, FSCA, DEMO, FIELD & P M VISIT, FSCA & P M VISIT) |
| complaint | Standard Complaint | call forms + request; PER PRODUCT via `extra.product` |
| pendingreason | Call Pending Reason | Visit (Unsolved branch) |
| cancelreason | Call Cancel Reason | Call cancel |
| dccrgrouping | DCCR Complaint Grouping | DCCR Review 3, per product (COMM = all) |
| rootcause | Root Cause Key Word | DCCR Review 3, per product |
| department | Department | Person, Training audience |
| feedbackrating, orapproval | — | defined, not read by any screen today |

Three "lists" are DERIVED from tables, not stored: party ← Party, spare ← Part,
product ← Machine `item_name`. They are the lookups of 0.2.

**Standard Complaint takes no free text in any module** (the user's rule):
every count and frequent-failure match downstream runs on that value.

---

## 3. PRODUCT DATABASE

Screens: Product Database, Product Database 2.0, Product Master (product
lines, §2.4), Product & Party Search, Machine History, Warranty Register,
Contract Register, Ownership Transfer, Machines Without an Installation Call.

### 3.1 The one decision this group turns on

Today there are **three implementations of "what cover is this machine
under"** and they disagree (`machine_cover` 0036, `product_database_v2` 0218,
`product_database` 0235, and the STORED `products.item_status` written by
`sync_product_machine`):

| | `machine_cover` | Product Database 2.0 | `product_database` (the screen) |
|---|---|---|---|
| Key | serial only | product + serial, squashed to a–z0–9 | product + serial, lower+trim |
| Registers read | 2 | 5 (sale, contract, additional entry, transfer, installation call) | `products` + contract + install call filtered to current party |
| Order | **contract first**, blank type → CMC | **warranty first**, blank type → `CONTRACT (TYPE NOT RECORDED)` | warranty first |
| Party | contract's, else sale's | latest-dated of transfer / additional entry / contract / sale | `products.party_name` (latest of sale vs transfer) |

**Build ONE: Product Database 2.0's rule** (the user's own spec, CW-014,
CW-017: five registers, product+serial, warranty decides before contract, a
blank contract type is reported not guessed). In Creator it is a set of
formula fields or a workflow on the Machine form that re-derives cover whenever
a sale line, contract line, transfer, additional entry or installation visit
for that machine is saved — the same eight "mark stale" triggers 0223 attaches,
except Creator can recompute per machine instead of rebuilding the whole view
every five minutes.

### 3.2 Machine (from `products`)

**Key.** Product + Serial, unique (0081). Serial alone is not unique.
**Fields (32 the master export carries, `uploads.ts:1387`).** Party; Item name
(product); Serial; Item status (cover code); Warranty number/start/end;
Contract number/type/start/end; Item code (→ Product Line); Item details
(long/short); Sold through (dealer); State/City/Address; PO no/date; Warranty
status keyed and Contract status keyed (the export's own words — keep them,
they are not computed); PM visits (NULL = nobody said); Other details;
Service engineer (Person); ProdFinal; Installation completed; Inst call (UCN),
inst date, inst call status; Report; Associated accessory; Active. Added 0330:
invoice no/date, warranty years/months, accessories included, transfer
ref/date.
**Rules.** `item_status` is normalised through `cover_code()` on every write
(§3.5). No DELETE policy: a machine is never deleted. Writes need
`masters.edit.records`.
**Load.** `products.csv` with `blanksClear` semantics (a blank cell CLEARS the
column, because the master export is the whole row) — load it LAST in this
group, after the registers (§1), and only for machines the registers did not
produce, or the workflow's derived values are overwritten by stale exported ones.

### 3.3 Sale Entry / Sale Item (from `sale_entries`, `sale_items`)

Header: unique SA number (series continues from the highest, floor 1183;
offered client-side and refused on collision — in Creator an auto-number seeded
from the export). Party (lookup), Sold through (dealer), Invoice no/date,
Warranty start, years/months, PM visits, status as keyed, other details, the
party's address block copied in. Required on the form: party, invoice no,
invoice date, warranty start, warranty months, PM visits.
Line (subform): priority, Product Line (code + name — pickers limited to
SELLABLE lines, §2.4), Serial, and every header field as an optional OVERRIDE
(`coalesce(item, header)` — a Creator formula per field), accessories/
consumable included, contract price fixed, already sold to, replacement unit
(+ SL), add call, inst call (UCN — a non-UCN value is blanked; an app user may
not blank an existing one, 0234). Unique `uid` = SA|product|serial.
**Rules.** Saving a line or header re-runs `sync_product_machine` for the
machine (§3.6). A line whose header is missing on import gets a stub header
(so import order does not matter — keep that behaviour or load headers first).
Delete of a header needs `cover.edit.delete` and cascades to its lines.

### 3.4 Contract Entry / Contract Item (from `contract_entries`, `contract_items`)

Header: unique MC number (floor 13), Party, Payment schedule (Yearly / Half
Yearly / Quarterly / Monthly), Bill generate at (Beginning / End of period),
Contract type (**CMC / AMC** only on the form), start, years/months, PM visits
total, status (computed Active / About to Expire / Expired), previous MC
(set by Renew: new MC, start = day after old end, rates may change).
Line: product code/name/serial, every header field as an override, rate, tax,
total after tax (= rate + tax), present item status (cover-coded), last
contract number/end, SA number/end. Unique `uid` = MC|product|serial.
**Rules.** A contract line for a machine the install base does not hold
INSERTS the machine (0330) — keep this: a contract is evidence a machine exists.
`cover_state(end)`: NULL → NOT COVERED; past → INACTIVE; within 30 days →
ABOUT TO EXPIRE; else ACTIVE (0187).

### 3.5 Cover vocabulary (`cover_code()`, 0208)

One vocabulary everywhere: **WGP / OGP / CMC / AMC**. The function squashes the
input to a–z0–9 and matches the WHOLE string:
WGP ← wgp, warranty, underwarranty, inwarranty, withinwarranty, guaranteeperiod…
OGP ← ogp, outofwarranty, outofguarantee, outofcover, outofcontract, nocover…
CMC ← cmc, comprehensivemaintenancecontract, undercmc.
AMC ← amc, annualmaintenancecontract, underamc (and for a CONTRACT type:
labour, labor, labourcontract → AMC; comprehensive → CMC).
**An unrecognised value is returned UNCHANGED, never bucketed** — a guess
written into a quality record is worse than a value that reads as odd. In
Creator: a Deluge function applied on validate to every cover field (machine,
call `item_status`, contract line `present_item_status`), with the same
synonym table, and NOTHING else allowed to write those fields.

### 3.6 How the stored machine row is filled (`sync_product_machine`, latest 0391)

This is the workflow to rebuild on the Machine form, run for a product+serial
whenever any of its registers changes. It reads: the latest sale line by
warranty end; the installation choice (`installation_warranty_starts`: start =
solved date only if the choice was "Installation Call Solved Date"); the latest
contract line by contract end; the additional entry; the latest transfer (by
`transferred_at`, then created, then transfer date); the latest transfer
carrying a fresh warranty; the latest carrying an invoice. It writes:

- **Warranty**, first that applies: a transfer's fresh warranty if it starts on
  or after the installation/sale/additional start (number = the OT number);
  the installation start+end; the sale's; the additional entry's; else keep.
- **Contract**: contract line, else additional entry, else keep.
- **Party** = `machine_current_party()`: the later of the latest sale and the
  latest transfer; a transfer wins an exact tie; neither → keep stored.
- **PM visits**: the contract's total overwrites the sale's.
- Numbers belonging to ANOTHER model sharing the serial are cleared.
- **Period end = `cover_period_end(start, months)`**, which reproduces the OLD
  app's JavaScript month overflow: 31-Jan + 1 month ends **2-Mar**, where
  calendar arithmetic says 27-Feb (26 of 458 live pairs differ, CW-005).
  **Decide now whether Creator keeps this.** Keeping it means a Deluge
  function, not Creator's date arithmetic; dropping it changes 26 expiry
  dates on live machines and must be announced.

### 3.7 Ownership Transfer (from `ownership_transfers`)

One row per hand-over. Unique (OT number, serial); OT number = `OT<n>`
minted on insert. From party, To party (required; **from ≠ to is a CHECK**),
Transfer date (the day) and `transferred_at` (when recorded, 0240 — both,
because "latest of sale and transfer" needs a time); Reason, Remarks, Document
URL, attachments; Sold through = From party if it is a DEALER; optional fresh
warranty (start + months > 0, end via `cover_period_end`); optional invoice.
Not editable or deletable on screen. After save: Machine party re-derived
(§3.6). **Known gap to NOT copy:** the trigger fills a blank From party by
SERIAL ONLY (0183) — in Creator the machine is a lookup, so From party comes
from that record.

### 3.8 Additional Entry (from `product_additional_entries`)

A machine recovered by hand when the sale paperwork is lost: product + serial
(unique), party, warranty and contract fields, source note, document URL.
Supplies cover ONLY where sale and contract are silent. The on-screen form
today upserts on serial alone and is recorded broken (D-054, CW-015); build it
on product+serial.

### 3.9 Installation Warranty Start (from `installation_warranty_starts`)

One row per installation call (unique on UCN): the engineer's answer to
"Warranty Start Date?" — *Installation Call Solved Date* or *Invoice Date* —
with the call's solved date; the resulting warranty start/end/months are
SYSTEM-written and an app user's value is discarded. Fed by the installation
visit's feedback (0331/0332). In Creator: written by the Installation Call's
visit workflow, read by §3.6.

### 3.10 Screens that are reports, not forms

- **Product Database** — read-only list over the Machine form; actions +Field
  call, +Install call, ⇄ Transfer, export.
- **Product Database 2.0** — the same records under the §3.1 rule, with a
  record drawer linking Machine History, SA, MC, OT and UCN. Once ONE rule is
  built (3.1) the two screens are one report with two layouts.
- **Product & Party Search** — by product/serial or by party; the party card
  and its machines (owners come from `products.party_name`, not the Party
  Master: a party picker on a call lists parties that OWN machines).
- **Machine History** — no view; a timeline assembled from machine, calls,
  visits, consumption, FFRs, feedback, sales, contracts, transfers, additional
  entries and indoor jobs, filtered by serial then model. A Creator page with
  one related-records block per register. Each lookup is audit-logged
  (`machine.history`).
- **Machines Without an Installation Call** — sale lines whose `inst_call` is
  not a UCN, with candidate UCNs by product+serial or call number
  `WI-<product>-<serial>`. Admin/Technical Support only.

---

## 4. CALLS

Screens: Request Registration, Pending Registrations, Field Call Register,
Installation Calls, Preventive (PM), Pending Calls, Visit Reports, PM Due, Call
Review, Daily Complaint Review Register, My Workload.
Standing reference: `docs/CALL_REQUEST_REQUIREMENTS.md` (CR-001…CR-033) — read
it before building the request form.

### 4.1 Numbers

| Series | Format | Rule |
|---|---|---|
| UCN (`next_ucn`, 0125) | `YY` + month letter A–L + `DD` + type letter F/I/P + 4 digits, e.g. `26H28F0009` | restarts at 0001 EVERY DAY per type, in Asia/Kolkata time; seeded from the highest already issued so a number is never reused |
| Call number (`next_direct_call_number`, 0015) | `CL` + YY + 5 digits | per year; a call registered FROM a request carries the request's `REQID-Product-Serial` instead |
| REQID (`next_call_reqid`, 0010) | `R<n>` | one sequence |

In Creator: UCN is a custom function (date parts + a per-day-per-type counter
record), not an auto-number — Creator's auto-number cannot restart daily with
a date prefix. The counter must be seeded from the export on cutover day.

### 4.2 Call Request (from `call_requests`)

One ROW PER MACHINE on a request; a request is 1–5 rows sharing a REQID.
Unique `reqid-product-serial`. Fields: REQID, submitted at, submitter email,
Engineer, Call type (value list), Party / State / City / Address, customer
contact name + number, Product + Serial (lookup Machine), Standard Complaint
(per-product list, no free text), Reported problem (mandatory), Installation
report + KYC links (Drive — becomes a File field), Call attended + Attended
date or Plan date, comments; Status (Pending / Registered / Mapped /
Cancelled), cancel reason/at, actioned by/at, UCN.
**Rules (CR-001…033, and the triggers 0097/0260).**
- The MACHINE names the customer: serial-first search fills party and site;
  the first call fixes the customer, later rows inherit it; a serial must
  resolve to a machine. **Installation exception**: free-text customer and
  typed serial allowed.
- The customer search must never come BEFORE the machine search (CR-006).
- Content is FROZEN once status leaves Pending (0260): party, site, machine,
  complaint, type, engineer, contacts, plan date. REFUSES.
- Status follows the UCN: when a UCN is written and status is blank/Pending it
  becomes Registered. Never deleted (no delete policy); Cancelled with a reason.
- An installation CALL saved with product+serial auto-registers every pending
  INSTALL request for that machine (0406): UCN written, status Registered,
  actioned by/at stamped.
- Visibility (`cr_read`): office roles see all; else own (created by / email)
  or an engineer in my team.
- Note for the rebuild: CR-028 says a caller-supplied `created_by` is
  discarded; the trigger only fills it when blank. Build CR-028 as written.

### 4.3 Field / Installation / PM Call (from `field_calls`, `installation_calls`, `pm_calls`)

Three tables with IDENTICAL columns, split by type (0040) and unioned as the
`calls` view; each has its OWN permission prefix (`calls.*` / `install.*` /
`pm.*`). In Creator: **one Call form with a Register field** (Field /
Installation / PM) is simpler and the per-register permissions become
criteria on that field; or three forms if Zoho's permission model needs it
(verify, §9). Unique UCN.

**Fields.** Identity: UCN, Call number, Reg date/at, Added on, **two
registrant fields that answer different questions** — `created_by` is the
Hotline DESK the call is filed to (defaults to the Hotline engineer whoever
typed it) and `actual_created_by` is the person who typed it, stamped from the
session; "who registered this?" reads the second, "may this person see it?"
tests both. Customer/machine: party, city, state, product, serial, item status
(cover code), warranty number/start/end, contract number/start/end/type (COPIED
FROM THE MACHINE at registration and locked on the form). Complaint: call type,
Standard Complaint, complaint reported, complaint date, breakdown date, person
calling, mode of reporting. Vigilance (= DCCR Review 1): public health threat,
death, serious incident (Yes/No, default NO; every change logged to
`call_vigilance_changes`). Contact: name, number, designation, email.
Allocation: allotted to (Person), allotted email. Status: status as keyed,
last status + last visit at (DERIVED from the latest visit), **open_state**
(DERIVED), reopened at/count, cancelled at/by/reason.

**`open_state` (0226), in this order:** no visit and blank status → Unattended;
`%cancel%` → Cancelled; `%unsolved%` → Unsolved; `%report pending%` → Report
pending; `solved%` → Solved; anything else → Report pending. Test unsolved and
report-pending BEFORE `solved%` or "Solved - Report Pending" reads as Solved.
Colour code is FIXED in both themes: Unattended RED, Unsolved BLUE, Solved-
Report Pending PINK, Solved GREEN, wherever a UCN appears.

**Rules.**
- Edit by SECTION, each needing its key (0287): complaint fields →
  `<reg>.edit.complaint`; party/site/machine/cover → `.edit.customer`;
  contacts → `.edit.contact`; vigilance → `.edit.vigilance`; allotted to →
  `<reg>.allot`. Not editable once Solved or Cancelled.
- Allotting notifies the allottee ("Call allotted to you"), not on an
  unchanged value or an engineer rename (0394).
- Changing complaint or item status copies them onto every spare request for
  that UCN (0268).
- Installation call REFUSES a DEALER party (0351): dealers get an Ownership
  Transfer instead.
- Actions as functions, each requiring the call to be visible to the caller
  and the register's key: **Cancel** (reason required; only Unattended or
  Unsolved, not re-opened), **Restore**, **Re-open** (reason; only Solved, not
  already re-opened), **Close** (refuses cancelled, re-opened, already closed),
  **Close re-opened** (reason), bulk cancel, bulk re-allot.
- No hard delete (0049): Cancel instead.
- **Read rule** (`calls_scoped_read`): `calls.view` AND (office role OR I filed
  it OR I typed it OR unallotted OR allotted to someone in my team).

**Load.** `field_calls.csv`, `installation_calls.csv`, `pm_calls.csv`,
conflict on UCN; the `extra` JSON column holds unmapped upload headings and
should become its own set of columns or be dropped after review.

### 4.4 Visit (from `reports`)

**One row per VISIT** (keyed `uid`: `WEB-…` from the form, `IMP-<ucn>-<ts>`
from imports), never one per call; a call visited three times has three. UCN
(**no foreign key — orphans exist**, 0.3), call number, Call status
(*Solved - Report Completed* / *Unsolved* / *Solved - Report Pending*), Pending
reason (list, Unsolved branch), `data` JSON (every form answer: software
version, complaint observation, job done…), manual report link, engineer,
**visit_at** (when it happened) and **updated_at** (the ENTRY date).
**Rules.**
- The call's `last_status`/`last_visit_at` come from the latest ENTRY —
  ordered `updated_at desc, id desc` — not the latest visit date (0032/0057).
  A LIST of visits reads by `visit_at desc`. Two orderings, deliberately.
- A visit date may not be in the future (IST) or before the call's complaint
  date; applies to form entries, not imports (0115).
- Call Reporting saves the VISIT FIRST and the spares second — the order the
  spare guard in §5 depends on.
- The `data` JSON must become real fields in Creator: list the distinct keys
  in the export (`jsonb_object_keys`) and make a column per key; the three
  REPORT_COLS uploads (`uploads.ts:690`) name the standard ones.
- Writes need `<reg>.report.visit`; delete is blocked by trigger.

### 4.5 Pending Registrations, Pending Calls, PM Due, My Workload

- **Pending Registrations** — requests with no UCN; map to a UCN, cancel with
  reason, or create the call prefilled (call number = the request's unique
  id, cover from the Machine). For an OFFICE role this list is the WHOLE
  COMPANY'S — paging, not a cap.
- **Pending Calls** — `pending_calls` = not cancelled AND (open_state ≠ Solved
  OR re-opened). Tiles by status, chips by type and engineer, bulk re-allot.
- **PM Due** — computed from the Warranty and Contract registers: start plus
  its share of the period with a 30-day month; shown Generated / Missed; tick
  and create: dated the 1st of the month, allotted to the machine's engineer,
  complaint "SCHEDULED PM VISIT k / N" (`pm_due`, 0401, needs `pm.generate`).
  A Creator scheduled function or an on-demand report.
- **My Workload** — count cards per register the reader may open; counts over
  partly loaded data show `+`.

### 4.6 DCCR Review (from `call_reviews`) and Call Review (`call_report_reviews`)

`call_reviews`, keyed by UCN: Review 2 (risk to patient, warranty failure,
frequent failure — Yes/No; actual product), Review 3 (grouping, root cause —
per product lists; spare category Spare / Consumable / Correction /
Calibration; observation); `review2_done`, `review3_done`, `any_potential_effect`
are formulas; review dates stamped when a stage completes, reviewer stamped
from the session, changing a date needs `review.correct_date`; **effect = YES
raises a Field Failure Report automatically** (at most one per UCN, not for
imported rows). Review 1 is the call's own vigilance answers. Review status:
Review 1 Pending → 2 Pending → 3 Pending → Completed.
`call_report_reviews`: "Report Reviewed" mark + remarks on a solved call,
needs `callreview.mark`. Note: the screen offers re-open and reco to
`callreview.mark` holders while the database requires `<reg>.reopen` and
`consumption.reconcile` — build the database's rule.

---

## 5. SPARES

Screens: Spare Requests, RM Approval, Pending Dispatch, Stock Out, Spare
Consumption, Hand Stock, Material Returns (MRN), Stock Transfer, Hand Stock
Report, Spare Insights, Consumption Report, Stores Dispatch Report.
References: `public/docs/how-a-spare-moves.html`, `how-hand-stock-moves.html`,
`spare-module-schema.html`, `src/lib/spareflow.ts`. Two of those pages are
behind the migrations and must not be copied as they read: the hand-stock page
still says consumption is capped at the balance (0401 replaced the refusal
with a notification), and the spare page's ledger table says a tick-box
approval writes nothing (0311 made it write Auto-Approved like the single
Approve).

### 5.1 Numbers

| Series | Format | Counter |
|---|---|---|
| OR (request) | `OR-YYMM-NNNN` | per month (`spare_or_counters`) |
| Line | `OR-YYMM-NNNN-RR`, RR = row 01–20 | per request |
| Stock out = Delivery Challan | `SO-YYMM-NNNN`; `dc_number` IS the SO number (0028: "the challan is the stock out, not a second series") | per month |
| MRN | `MRN-YYMM-NNNN`; `mrn_no` is the PAPER slip number, typed | per month |
| Stock transfer | `ST-YYMM-NNNN` | per month |

Monthly-resetting with a `YYMM` prefix: Creator's auto-number cannot do this
either; same custom function + counter record as the UCN (§4.1).

### 5.2 Spare Request + Lines (from `spare_requests`, `spare_request_lines`)

**Header**: OR number (unique, immutable), request date, type (*Call Based* /
*HandStock* — matched loosely: "Hand Stock", "HANDSTOCK" count), Engineer (+
email), UCN / call number / party / product / serial / complaint COPIED FROM THE
CALL (no FK; 0268 keeps complaint and cover in step when the call changes),
Item status (cover code — on insert copied from the call, afterwards may change
only TO the call's value), HandStock reason, remarks, stage (a ROLLUP of the
lines: the least-advanced live stage; all Rejected/Dropped → Rejected or
Dropped; 'Stores' displays as *Awaiting Dispatch*). The header's own approval
columns are legacy summaries: **the record is on the lines, and any approval
written to the header is refused** (0016).

**Line** (subform or child form, at most 20 per request): part (`CODE|Desc`,
picked from the Part Master, labour parts refused, 0414), qty ≥ 1, the three
approval triplets `rm_/commercial_/nsm_approval|_by|_at` (default Pending),
stores status (Pending / Dispatched / Dropped), reject reason + rejected
stage, dispatch fields (DC/SO number, courier, remarks, dispatched by/at,
dispatched qty — SUM over partial stock outs), receipt fields (received
by/at/qty/remarks), `approval_data` (the Commercial and NSM form answers —
make them columns). Part and qty are FROZEN once RM has decided (0340) and may
be changed only by the requester before that.

**Stage formula (`spare_line_stage`, 0270), first match wins:**
1. any approval matches `reject` → **Rejected**
2. received_at set → **Received**
3. stores status matches `drop` → **Dropped**
4. stores status matches `dispatch` → **Dispatched**
5. RM not a YES → **RM Approval**
6. Commercial not a YES → **Commercial**
7. NSM not a YES → **NSM**
8. else → **Stores**

A YES is the WHOLE value matching *Approved* / *Auto-Approved* / *Cleared for
Stores Processing* (case-insensitive, `APPROVED_RE` in `spareflow.ts`); any
other word holds the line at that approver. Creator: a formula field on the
line, the header's stage a workflow rollup on line save.

**Which middle stages apply (0210)** — decided ONCE, at RM approval, by
writing the literal `Auto-Approved` (no `_by`, no `_at`) into each stage not
needed; after that the stage reads only the stored columns:
- Commercial needed ⇔ cover is **AMC or OGP** (somebody is being charged).
- NSM needed ⇔ **AMC or OGP or a HandStock request** (no machine, no cover
  for Commercial to weigh).
- Routes: AMC/OGP → RM → Commercial → NSM → Stores. Other cover → RM → Stores.
  HandStock → RM → NSM → Stores.

**Steps, who, what is stamped on the line**

| Step | Key (default roles) | Written |
|---|---|---|
| Requested | `spare.request` (rm, rgm, spare_coordinator — NOT engineer by default) | line inserted, stage RM Approval; then `file_visit_for_spare_request` files an *Unsolved / SPARES NOT AVAILABLE* visit when the call has none (not HandStock) |
| RM | `spare.approve_rm` (rm, rgm, hotline, spare_coordinator); **never your own request, and a manager only within their own tree** (0033); a coordinator managing nobody may approve anyone | `rm_approval=Approved`, `rm_by`, `rm_at`, plus the Auto-Approved stamps above. Never bulk "all N" at RM |
| Commercial | `spare.approve_commercial` | Approved or *Cleared for Stores Processing*, by/at; form: Admin status Cleared / In progress (In progress holds the line), reason, MC/SA no., direct-PO steps |
| NSM | `spare.approve_nsm` | Approved, by/at; form: Cleared / Put on HOLD (HOLD holds) |
| Stores dispatch | `spare.dispatch` (spare_coordinator, stores_incharge) via `dispatch_spare_lines` | one transaction: all lines must still be pending dispatch and belong to ONE engineer; sent ≤ remaining; refurb part must exist and be active (and Audit Mode off); header SO inserted; line `dispatched_qty` +=, courier/remarks copied, `dispatched_by` = SESSION NAME (0211/0345, caller value discarded); on the last unit `stores_status=Dispatched` + DC/SO numbers; engineer notified. Partial dispatch stays at Stores |
| Received | `spare.receive`, the REQUESTER only, after dispatch (`receive_spare_shipments`) | per-shipment received at/by; line `received_qty`; line Received only when received ≥ qty. **Hand stock does not change here** — it changed at dispatch |
| Reject | that stage's approver; reason REQUIRED (0313) | stage's triplet = Rejected + by/at; `rejected_stage`; terminal |
| Drop | `spare.drop` (hotline, spare_coordinator) or `spare.dispatch`, at any stage; reason required | `stores_status=Dropped`, reason in dispatch remarks, by/at; terminal, adds nothing to stock |
| Change engineer | `spare.reassign`; refused after dispatch; reason required; logged to `spare_request_engineer_log` | |

**Read rule.** Office roles; else creator, own email, or an engineer in my
team. Delete: admin or requester, only while at RM Approval with nothing
decided or received.

**Load.** `spare_requests.csv` (conflict OR), `spare_request_lines.csv`
(conflict line uid; a line whose OR is missing is held back). Approval words
are kept as exported.

### 5.3 Stock Out / Delivery Challan (from `spare_dispatches`, `spare_dispatch_lines`)

Header: SO/DC number, DC date (editable), engineer, courier, remarks, line
count, total qty, dispatched by (session-stamped, frozen on update — "an
issued challan says what it said"), dispatched at. Lines: request line,
part (the refurbished part code when `refurbished`), qty, per-shipment receipt
stamps. **The Delivery Challan print carries the COMPANY logo, never the
app's** (`brand.ts`). Lowering or deleting a dispatch line may not take the
engineer's balance below zero (0339).

### 5.4 Consumption (from `spare_consumption`)

One line per part per call: UCN, call number, part, qty (0 = VOIDED; the row
is kept with `original_qty`, adjusted by/at, reason), engineer, source
(*Report* from a visit / *Reconciliation* added later), remarks, recorded by,
GRIR, source ref (import row id, unique). **Rules:**
- **A spare needs a visit behind it** (0214/0243): a non-blank UCN must have a
  Visit; a Reconciliation is exempt (it exists for a part fitted but never
  reported) and needs `consumption.reconcile`, a UCN that exists, engineer,
  part and a reason. Call Reporting saves the visit FIRST (§4.4).
- Only qty may change afterwards, never the call, part, engineer or source; it
  may not go below 0; a reason is required. **Quality records are never
  deleted** (0049): a wrong line is VOIDED to 0.
- **Consumption may take hand stock NEGATIVE and is still booked; every active
  Spare Coordinator is notified** (0401, the user: *"Allow even if it's negative
  but notify the Spare Coordinator"*). Labour parts: qty 1, never stock.
- A PM call consuming a part the Part Master calls SPARE opens/fills its DCCR
  review row (0397/0400).

Load: `spare_consumption.csv` on source ref; pre-RITHI history is separate
(`spare_consumption_history`, `spare_issue_history`, unique on source + ref,
NOT capped and not subject to the visit rule).

### 5.5 Hand Stock — derived here, STORED in Creator (the one forced design change)

Here it is a view: **on hand = Σ IN − Σ OUT** per (engineer name, part code)
over `handstock_movements` (0413), counting only movements on or after the
cut-off (`handstock_period.closed_through`, currently 2022-06-08, so counting
starts 09-Jun-2022 from the WinMax opening), labour codes excluded.

IN: dispatch lines (dated by booking time, not DC date); legacy dispatched
lines with no dispatch row; historical issues; transfers in (by transfer date);
opening pools; positive adjustments.
OUT: consumption (voided = 0); historical consumption; transfers out; material
returns good + defective (by MRN date); negative adjustments.

Creator has no SQL view, so the Hand Stock form holds a STORED balance per
(engineer, part) and every movement form adjusts it on save. Two consequences:
- **Every movement must be immutable or re-apply on edit**: material returns
  are already immutable (0310), transfer headers are fixed after recording
  (0339), adjustments are never edited (no UPDATE policy), consumption may
  change only qty. Keep those as the Creator rule and re-apply the delta on
  the one editable field.
- **A rebuild action**: a scheduled function that recomputes every balance
  from the movements and reports differences, so the stored number can be
  proved rather than trusted — the project's own standard.

Refusals that stay refusals (balance may not go below zero): transfers,
returns, adjustment removals, lowering/deleting a dispatch line or an opening
pool. Consumption is the ONE exception (§5.4). Importers bypass all of them.

### 5.6 Material Returns, Stock Transfer, Adjustments, Opening

- **MRN** (`material_returns`): one row per item; MRN uid minted, slip number
  typed; engineer must be the caller's own name unless `stock.return.others`;
  good + defective > 0, capped at what is held; immutable after save; print
  R/SER/STR/002.
- **Stock Transfer** (`stock_transfers` + lines): from ≠ to engineer, date,
  per-part reason (0322), qty > 0, sender's balance must stay ≥ 0; header
  fixed after recording; print MTN R/SER/STR/003.
- **Adjustment** (`handstock_adjustments`): ± qty ≠ 0, reason required,
  reference (e.g. MTN no.), engineer must be an active person, part must exist;
  needs `consumption.reconcile`; never edited.
- **Opening** (`handstock_opening`): unique (engineer, part code, source),
  qty, as-of date, source ('WinMax HS' as of 2022-06-09, 'Opening YYYY');
  lowering may not take the balance below zero.

### 5.7 Reports in this group

- **RM Approval** — lines at RM Approval with the call, cover, complaint; rows
  not in the reader's tree show "Not yours"; bulk approve / reject with reason.
- **Pending Dispatch** — cards per engineer; tick lines for ONE engineer;
  partial qty; refurb; dispatch dialog → Delivery Challan; drop with reason.
  An EMPTY queue says "nothing waiting" only for an office role; for anyone
  else it says "nothing waiting that you may see" (`seesEveryRecord`).
- **Stock Out** — one row per dispatch line, days to dispatch, DC and
  Declaration prints.
- **Stores Dispatch Report** — final approval = latest of the three `_at`;
  days to dispatch to one decimal in bands 00-03D / 04-07D / 08-15D / 16-30D /
  31-60D / >60D / No approval date; historical stock outs from 1-Jan-2025.
- **Consumption Report** — `consumption_report`: consumption LEFT JOINed to the
  latest visit, so Visit Date / Visit Entry Date / Visit UID come from the
  Visit, never from the consumption row; exports dates as Excel date serials.
- **Hand Stock Report** — the whole balance table; export only once fully
  loaded. **Spare Insights** — consumable vs spare, by cover, top parts and
  products, monthly, over a date window.

### 5.8 Two inconsistencies to settle rather than copy

- `srel_read` (0304) tests a key `spare.approve` that `rbac.ts` does not
  define (it has `approve_rm` / `approve_commercial` / `approve_nsm`). Build
  the three.
- The engineer role gets no `spare.request` by default and `spare.receive` is
  in no code default (granted by 0009 to admin, engineer, rm, rgm,
  spare_coordinator). Build from the exported `app_roles`, not the defaults
  (§6.2).

---

## 6. PERMISSIONS

### 6.1 Roles → Creator profiles

| role key | label | sees every record? |
|---|---|---|
| admin | Admin | yes (`is_admin`) |
| technical_support | Technical Support | yes, read-only (every module, no write key except `review.auto`) |
| zoho_migration | Zoho Migration | yes, read-only — the extraction login (§0.1); ends with the migration |
| nsm | NSM | yes |
| hotline | Hotline Engineer | yes |
| commercial | Commercial | yes |
| spare_coordinator | Spare Coordinator | yes |
| stores_incharge | Stores Incharge | yes |
| tally_coordinator | Tally Coordinator | yes |
| rgm | Regional Manager | own + team |
| rm | Reporting Manager | own + team |
| engineer | Engineer | own + team |

"Sees every record" = `can_view_all_calls()` (0035): admin, or the six office
roles, or ANY role granted `data.view_all`. Roles added on screen live only in
`app_roles`; "super admin" is not a role but an email list.

### 6.2 How a key resolves (`has_perm`, 0286/0300)

1. Signed in with no Person/profile row → **FALSE** for everything.
2. Admin → TRUE.
3. The role's STORED set contains the key or one of its PARENTS → TRUE. Only
   when the stored set is EMPTY does the engineer default apply.
4. The person's `extra_permissions` contains it → TRUE.

Parents (`perm_parents`, one list in two places): `calls.edit` →
`calls.edit.{complaint,customer,vigilance,contact}` (same for `install.`,
`pm.`); `calls.report` → `calls.report.visit`, `visit.spares`,
`visit.feedback`; `cover.edit` → `.entries`, `.delete`; `contract.edit` the
same; `masters.edit` → `.records`, `.kyc`, `.rename_part`,
`.swap_serviceman`, and `masters.{parties,parts,product_master}.{add,edit}`;
`users.manage` → `.details`, `.create`, `.disable`, `.access`, `.settings`.
**A policy or a button tests the CHILD, never the parent.**

In Creator: one profile per role; one permission set per key family; the
"child" keys become the per-action toggles on the form. Export the current
`app_roles` table (role → key list) and build the matrix from it rather than
from the code defaults — on a project in use every role has a tuned row and
the defaults reach nobody.

### 6.3 Keys by screen (this part)

- Party Master: `masters.parties.add/edit/delete`, `masters.edit.kyc`,
  `masters.edit.swap_serviceman`. Part Master: `masters.parts.add/edit/delete`,
  `masters.edit.rename_part`. User Master: `users.manage.*`,
  `users.reset_password`. Product lines: `masters.product_master.*`.
- Product Database: `calls.create`, `install.create`, `ownership.transfer`,
  `export.data`; 2.0 adds `pd2.rebuild`. Warranty Register: `cover.edit.*`,
  `masters.parties.add/edit`, `contract.edit.entries` (Convert). Contract
  Register: `contract.edit.*`. Ownership Transfer: `ownership.transfer`,
  `cover.edit.entries` (additional entries), `install.create`.
- Calls: `calls.view` (ONE key, shared by all three registers), then per register `.create`,
  `.edit` + four children, `.allot`, `.report` + `.report.visit`,
  `visit.spares`, `visit.feedback`, `.cancel`, `.reopen`; plus
  `spare.request`, `consumption.reconcile`. Requests: `request.create`,
  `pending.register`, `pending.mail`. Reviews: `review.edit`, `review.auto`,
  `review.correct_date`, `ffr.manage`, `callreview.mark`. PM Due:
  `pm.generate`.
- Every screen is first opened by its module key `mod:<path>`.

---

## 7. What does NOT translate — decisions, not translations

| Here | Why it cannot be copied | Build instead |
|---|---|---|
| Name-keyed links + rename-carrying triggers | Creator links by record | Lookups (0.2 #1); drop the rename cascades |
| Recursive team tree | no recursive query | stored "Visible to" set maintained by workflow (§2.3) |
| Three cover rules | they disagree | ONE: the 2.0 rule (§3.1) |
| `cover_period_end` month overflow | reproduces a JS bug on purpose | decide keep/drop (§3.6) |
| Daily-restarting UCN with date prefix | not an auto-number | custom function + counter record (§4.1) |
| `extra` / `data` JSON columns | no JSON column | one column per distinct key (§4.3, §4.4) |
| Hand stock derived, never stored | no SQL views | stored balance + movement deltas + a rebuild check (§5.5) |
| Row-level security per table | Creator permissions are per form/report + criteria | criteria on Allotted-to ∈ visible-to, plus office-role profiles (§6) |
| Session-stamped columns (`actual_created_by`, `dispatched_by`, `sys_*`) | trigger discards client value | Creator's Added/Modified user + hide the field on the form |
| "Refuse delete while referenced" | 0325/0350 | disable delete; Retire action |

---

## 8. Acceptance

The validation package (`src/lib/validation.ts` → `docs/REQUIREMENTS.md`)
already lists, per screen, the user requirement, the system requirements and
the tests. For this part, filter the traceability matrix to the modules named
in §2–§5 and re-run each test against Creator by hand; the SQL suites in
`supabase/tests/` do not run there, but every `expect ERROR` line in
`call_*`, `spare_*`, `handstock_*`, `cover_*` and `masters_*` suites is a
refusal Creator must also make and is the test case list.

Count reconciliation after load, per table, against the counts from §0.1.
The three probes already written for this — `_why_do_the_two_report_counts_differ.sql`,
`_why_is_product_database_2_empty.sql`, `_product_database_2_vs_1.sql` — are
the reconciliation queries for visits and machines.

---

## 9. Verify against Zoho's current documentation before building

I am not certain of these and they change the design; check Creator's current
docs, not memory:

- The per-import row ceiling and file size (the Machine export is ~20,000 rows;
  calls and visits are larger).
- Whether record-level permission criteria can reference a multi-lookup on the
  current user's Person record (the "Visible to" filter), or whether every
  scoped report needs a Deluge-filtered custom report.
- Whether a Deluge workflow can write several records atomically (the spare
  stage guard and the UCN counter both depend on all-or-nothing writes).
- Whether a subform row can carry its own workflow and permission (per-LINE
  spare approvals, §5), or whether lines must be a separate form.
- Auto-number: prefix + per-year reset is supported; per-DAY reset with a
  date-derived prefix is probably not (hence the custom function in §4.1).
- Zoho user licensing for ~every engineer vs. a customer portal for field
  users — a cost decision, not a design one.
