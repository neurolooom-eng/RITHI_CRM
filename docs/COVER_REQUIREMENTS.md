# Cover — warranty, contract, ownership transfer, and the machine record

**Status: DRAFT, written 2026-09-20 from the modules as built.** Not a
controlled document. It states what the cover modules must do, maps each
requirement to the ISO 13485:2016 clause it serves, and says whether the system
does it today.

**This file is a standing reference**, the third after
[`CALL_REQUEST_REQUIREMENTS.md`](CALL_REQUEST_REQUIREMENTS.md) (CR) and
[`ISO13485_SERVICING.md`](ISO13485_SERVICING.md) (SR). Its identifiers are
**CW-nnn** and `npm run docs:reqs` folds them into
[`REQUIREMENTS.md`](REQUIREMENTS.md) alongside the rest.

**Keeping it current is part of the change.** A requirement's status line is
updated in the same commit that makes it true. A requirement set that lags the
system is worse than none, because somebody plans around it.

---

## What this is, and what it is not

This is the requirement set for **what a machine is covered by**: the warranty
it was sold with, the maintenance contract it is under, who owns it, and the
single record that answers those questions for one machine on one day.

It is **not** the servicing process requirements (that is `ISO13485_SERVICING.md`,
which asks what §7.5.4 demands of servicing), and it is **not** the software
validation package (`src/lib/validation.ts`, which asks under §4.1.6 whether the
application is fit to be used in the quality system). Cover sits underneath
both: a call priced against the wrong cover is a commercial error, but a call
routed to the wrong *machine* is a traceability failure.

### Which clauses these serve

| Clause | Why cover touches it |
| --- | --- |
| **§7.5.8 Identification** | The machine must be identifiable throughout. Model **and** serial is the identifier; a serial alone is not. |
| **§7.5.9 Traceability** | Records of the device, its owner and its service history must connect. An ownership transfer that nothing reads breaks that chain. |
| **§7.2.1 / §7.2.2 Customer requirements** | A warranty and a maintenance contract are *agreed requirements*. What was agreed, for how long, and with whom must be recorded and reviewed. |
| **§4.2.5 Records** | These are quality records: they must be legible, retrievable, and not silently rewritten. |
| **§7.5.4 Servicing** | Whether a visit is under warranty, under contract or chargeable changes what the organisation owes. |

---

## How to read a requirement

| field | meaning |
| --- | --- |
| **CW-nnn** | cover requirement, numbered here for reference |
| **Clause** | ISO 13485:2016 |
| **Status** | **Met** / **Partial** / **Absent** in RITHI CRM today |

Status assesses the *system*, not the quality system: something Absent here may
be controlled today on paper.

---

## A. Identifying the machine

**CW-001 — A machine is identified by its model together with its serial.**
*§7.5.8.* Every cover record shall identify the machine by model **and** serial.
A serial number alone shall never identify a machine, because serials repeat
across models.
**Status: Partial.** `machineKey()` (`src/lib/machine.ts`) and
`public.machine_key()` (0218) both do this and `check:ui` holds them together.
**`machine_cover` does not** — it keys on `lower(btrim(serial_number))` alone,
so machines that share a serial under different models are merged into one row
wearing one machine's cover. The install base has eleven machines numbered 219.

**CW-002 — One machine is one row.**
*§7.5.8.* A machine known to more than one register shall appear once, not once
per register.
**Status: Met (2.0).** `product_database_v2` unions the three registers on the
machine key. The stored `products` table can hold the same machine more than
once where the spelling of the model differs.

**CW-003 — The identifier is normalised the same way everywhere.**
*§7.5.8.* Two records of the same machine shall match whatever the punctuation
and spacing of the model.
**Status: Partial.** The client and 0218 squash to letters and digits, so
`ORION-G`, `ORION G` and `ORIONG` are one model. The **generated** `machine_key`
columns on `products` and `product_additional_entries` only lower-case and trim,
so those two keys disagree with the other two by punctuation alone.

## B. Warranty

**CW-004 — A warranty has a recorded start, a recorded period and a derived end.**
*§7.2.1, §4.2.5.* The end of a warranty shall be derived from its start and its
period, not typed independently of them.
**Status: Met (2.0).** `cover_period_end(start, months)` derives it;
`product_database_v2` prefers the derived end wherever both are known and falls
back to the register's stored end otherwise.

**CW-005 — The end of a period is computed the same way everywhere.**
*§4.2.5.* One arithmetic, one answer.
**Status: Met (2.0).** `cover_period_end()` reproduces `addPeriod()` in
`src/lib/dates.ts`, **including its JavaScript month overflow** — 31 January
plus one month is 2 March, where Postgres's own interval arithmetic clamps to 27
February. 26 of 458 start/period combinations differ between the two; proved
against the application rather than assumed.

**CW-006 — A warranty starts when the machine was installed.**
*§7.5.4, §7.2.1.* Where an installation was recorded, its date shall start the
warranty, in preference to the selling register's.
**Status: Partial.** The installation report captures `Warranty Start Date?` and
stores it on the feedback row; **nothing read it back into cover** before 2.0.
`product_database_v2` now reads it, falling back to the installation call's
solved date and then to the registers.

**CW-007 — An unreadable answer is not a date.**
*§4.2.5.* A cell holding something that is not a date shall yield no date, and
shall not prevent the rest of the register being read.
**Status: Met (2.0).** Read through `imported_ts()`, which returns nothing
rather than raising. A bare cast would not spoil one row — it would fail the
whole view.

## C. Contract

**CW-008 — A contract's type is one of two families, and is never guessed.**
*§7.2.1.* Labour shall be AMC and comprehensive shall be CMC. A type that is not
recognised shall be carried through unchanged, never bucketed into either.
**Status: Met (2.0).** `contract_cover_code()`. **`machine_cover` defaults a
blank type to CMC**, which silently promotes a labour contract to comprehensive
on the strength of an empty cell.

**CW-009 — A contract covering today with no recorded type is reported, not assumed.**
*§4.2.5, §8.2.1.* The record needs correcting and must say so.
**Status: Met (2.0).** Such a machine reads `CONTRACT (TYPE NOT RECORDED)`.

**CW-010 — Cover is continuous across a renewal.**
*§7.2.2.* A successor contract shall begin the day after its predecessor ends,
so no day resolves to two contracts or none.
**Status: Met.** FRS-056 and the renewal flow; `machine_cover` has one answer
per day.

## D. Ownership

**CW-011 — A change of owner is a dated record, and it is read.**
*§7.5.9.* Who owns a machine shall be derived from the ownership transfer
register where one exists, not left at whoever first bought it.
**Status: Partial.** `ownership_transfers` records it (0072) and Machine History
shows it. **No cover view consulted it** before 2.0, so a transferred machine
still read as the original buyer's on every cover screen.

**CW-012 — The most recently dated evidence decides the party.**
*§7.5.9.* Where the registers disagree about who owns a machine, the latest
dated claim shall win — a transfer is one dated claim among several, not
permanently the last word.
**Status: Met (2.0).** A machine sold in 2020, transferred in 2021 and put under
a new contract in 2024 belongs to whoever the 2024 contract names.

**CW-013 — A machine may not be transferred to the party that already owns it.**
*§4.2.5.* A transfer from a party to itself is not a transfer.
**Status: Met.** 0182 / 0183 refuse it.

## E. The assembled record

**CW-014 — Every register that names a machine contributes to its record.**
*§7.5.9.* The warranty sale, the contract, the additional entries, the ownership
transfer and the installation call shall all be consulted.
**Status: Met (2.0).** `machine_cover` consults two of the five.

**CW-015 — A machine recovered by hand is a machine.**
*§7.5.8.* Additional Entries exist because the two registers missed machines;
those machines shall appear in the record.
**Status: Met (2.0).** They were absent from `machine_cover` entirely.

**CW-016 — What a machine is covered by today is derived, not stored.**
*§7.5.4.* The status shall be computed from the periods, not held as a value
that ages.
**Status: Partial.** `products.item_status` is **stored** — normalised by a
trigger (0208) but never recomputed, so it is whatever the import said.
`product_database_v2.item_status` is derived on every read.

**CW-017 — Warranty decides before contract.**
*§7.5.4, §7.2.1.* A machine inside its warranty is under warranty, even where a
contract also covers it.
**Status: Met (2.0).** **`machine_cover` asks the contract first**, so a machine
inside both reads as its contract type. This changes the answer for every
machine inside both.

**CW-018 — A derived value names the register that decided it.**
*§4.2.5.* A value assembled from five sources shall say which one it came from,
or it cannot be checked.
**Status: Met (2.0).** `party_from`, `warranty_from`, `contract_from` and
`item_status_reason` are columns on every row.

**CW-019 — The derived record does not overwrite the registers.**
*§4.2.5.* The assembled view shall be a reading of the records, not a rewrite of
them.
**Status: Met (2.0).** `product_database_v2` is a view; nothing is written, and
`public.products` and `machine_cover` are untouched.

**CW-020 — The record is readable only by those entitled to the underlying rows.**
*§4.2.5.* The assembled record shall not widen access to what it assembles.
**Status: Met (2.0).** `security_invoker` is set on the view, so row-level
security applies to whoever is reading — the fault 0040/0050/0057 shipped three
times.

---

## Test cases

Executable cases are in
[`supabase/tests/product_database_v2_test.sql`](../supabase/tests/product_database_v2_test.sql);
the operational ones are OQ-64…OQ-66 in the validation package.

| Test | Proves | Where |
| --- | --- | --- |
| **CWT-01** | A period ends the day before its anniversary, and 31-Jan + 1 month is 2-Mar, matching `addPeriod()` | suite §1 |
| **CWT-02** | The naive `start + interval - 1` rule *disagrees*, so the case is real | suite §1 |
| **CWT-03** | labour/labor → AMC; comprehensive/CMC → CMC | suite §2 |
| **CWT-04** | An unrecognised contract type comes back unchanged, never bucketed | suite §2 |
| **CWT-05** | A machine inside warranty **and** contract reads WGP | suite §3a |
| **CWT-06** | A labour contract reads AMC | suite §3b |
| **CWT-07** | The later contract names the party, over an earlier transfer | suite §3b |
| **CWT-08** | The transfer names the party where nothing later disagrees | suite §3c |
| **CWT-09** | A typeless contract reads `CONTRACT (TYPE NOT RECORDED)`, never CMC | suite §3d |
| **CWT-10** | A machine known only to Additional Entries appears | suite §3e |
| **CWT-11** | One serial under two models stays two rows | suite §3f |
| **CWT-12** | The answered Warranty Start Date starts the warranty | suite §4 |
| **CWT-13** | With no answer, the installation's solved date starts it | suite §4 |
| **CWT-14** | `n/a` neither reads as a date nor fails the view | suite §4 |
| **CWT-15** | The end is derived from the answered start plus the register's period | suite §4 |
| **OQ-64** | One row per machine, five registers, each value naming its source | validation package |
| **OQ-65** | Status derived warranty-first, no guessed contract type | validation package |
| **OQ-66** | Warranty starts at the installation; end by the app's arithmetic | validation package |

Each of CWT-05, CWT-09 and CWT-11 was **mutation-tested**: the rule was inverted
in the migration and the suite failed, so the test is known to be load-bearing.

---

## The gap, in order of consequence

**1. `machine_cover` merges machines that share a serial.** *(CW-001)* It keys
on the serial alone. Two machines of different models with the same serial
become one row, carrying one machine's warranty and the other's contract. This
is the fault `src/lib/machine.ts` was written to prevent, and it reached the
Hotline desk once already in a different screen.

**2. An ownership transfer changes nothing about cover.** *(CW-011)* The
register exists, the screen exists, the record is dated — and no cover view
reads it. A machine that changed hands still reads as the original buyer's
everywhere except Machine History.

**3. Machines recovered by hand are invisible to cover.** *(CW-015)* Additional
Entries exist precisely because the warranty and contract registers missed those
machines. `machine_cover` does not consult them, so they have no cover at all.

**4. A machine inside warranty reads as its contract.** *(CW-017)* Contract
before warranty. Every machine inside both is described by the wrong one.

**5. A blank contract type becomes CMC.** *(CW-008)* A labour contract with the
type cell empty silently reads as comprehensive — the more expensive obligation,
inferred from nothing.

**6. `products.item_status` is stored and never recomputed.** *(CW-016)* It is
whatever the import said. A warranty that expired last month still reads WGP
until something rewrites the row.

**7. The warranty start captured at installation is never read back.** *(CW-006)*
The engineer is asked for it, it is mandatory, it is stored on the feedback row
— and no cover record uses it.

**8. Two spellings of the machine key.** *(CW-003)* The generated columns
lower-case and trim; the client and 0218 squash punctuation. `ORION-G|201` and
`oriong|201` are the same machine to one and two machines to the other.

**Items 1–5 and 7 are closed by Product Database 2.0 for anything reading the
new view.** They remain open in `machine_cover` and `products`, which is
deliberate: the ask was to leave the existing Product Database alone, so nothing
that reads it has changed behaviour. Item 6 and item 8 are **not** closed — they
belong to the stored table.

### Quantifying it on the live data

Ranked above by consequence, not by count, because this repository cannot see
the live rows. `supabase/apply/_product_database_2_vs_1.sql` is read-only and
prints the two side by side: how many machines each holds, how many item
statuses disagree, and how many machines 2.0 lists that the old one does not.

---

## Caveats

- **Draft.** The clause mappings are for RA/QA to confirm; the statuses are an
  assessment of the software.
- **One assumption is recorded rather than resolved.** The ask said "arrange
  these 4 sources + Ownership Transfer"; three registers were named. 2.0 reads
  the three named registers for the machine list, Ownership Transfer for the
  party, and the installation call for the warranty start — five inputs. If the
  fourth source was meant to be something else, this is the line to change.
- **2.0 is a view, so it costs nothing to be wrong about.** Nothing writes, and
  the existing Product Database is untouched; the two can be compared on live
  data before anything moves.
