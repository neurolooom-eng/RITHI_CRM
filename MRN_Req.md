# MRN — Material Return Note — requirements

What the Material Returns module is required to do, why each rule exists, and
how each one is proved. Written from the shipped implementation
(`supabase/migrations/0039_material_returns.sql`,
`src/modules/MaterialReturns.tsx`, the importer in `src/lib/dataImport.ts`), so
it describes what is built, not a proposal.

Requirements are numbered `MRN-n` so a test, a review or a change request can
name one. **Verified by** points at the check that would fail if the
requirement broke. It is a companion to `HandStock_Req.md`: a return is the
fifth hand-stock movement, and everything that document says about matching,
negative levels and derivation applies here unchanged.

---

## 1. Purpose and scope

An engineer holding a spare they no longer need — wrong part, surplus on a job,
or a defective unit removed from a machine — sends it back to Stores on a
Material Return Note. Until now nothing recorded that: the spare stayed on the
engineer's hand stock forever, and the level drifted further from the bag they
are actually carrying with every return.

**In scope:** raising an MRN, the register of what has been returned, the effect
on hand stock, and loading the sheet-era MRN history.

**Out of scope:** Stores' own receipt of the parcel (there is no warehouse
stock level to credit — see `HandStock_Req.md` §12), any approval step, and
what Stores does with a defective unit afterwards (repair, scrap, RMA).

---

## 2. The effect on hand stock

**MRN-1.** A return **subtracts** from the engineer's stock level. The formula
becomes

```
Stock Level = Stock Out (from Stores) − Consumption
            − Stock Transfer From + Stock Transfer To
            − Returned to Stores (MRN)
```

*Verified by:* `material_returns_test.sql` steps 1–3.

**MRN-2.** **Good and Defective both leave the engineer.** They are two
quantities on one line because Stores needs to know which is which, but the
engineer is no longer carrying either.
*Verified by:* `material_returns_test.sql` step 3.

**MRN-3.** It is the **fifth arm of the same derivation**, not a second
subtraction bolted on. `handstock_movements` gains a `Return` movement
(direction `OUT`, `ref_type` `MRN`, referenced by the MRN number) and
`handstock_balance` a `returned` column; `engineer_stock` — which Stock
Transfer and its overdraw guard read — is a view over that same balance, so no
screen can disagree about what a return did (`HandStock_Req.md` HS-4).
*Verified by:* `material_returns_test.sql` steps 4 and 11.

**MRN-4.** A return is dated by the **MRN date**, falling back to when the row
was recorded — the same "best timestamp the row has" rule as every other
movement (HS-8).

**MRN-5.** The engineer and the spare are matched exactly as everywhere else:
`handstock_key()` on the name (case, spacing and punctuation folded) and
`part_code()` on the `CODE|Description` string, so a reworded description still
returns against the spare that was issued.
*Verified by:* `material_returns_test.sql` step 9.

---

## 3. Raising a return

**MRN-6. An engineer may only return what they are holding.** Both the spare
and the quantity are bound to that engineer's hand stock:

- the spare picker lists **only** the spares with a positive level for the
  chosen engineer, each labelled with how many are in hand;
- the Good and Defective boxes are capped at that level;
- the cap is **per spare across the whole MRN**, so two lines for the same
  spare cannot together exceed it;
- with nothing in hand, the form says so and refuses to submit.

*Verified by:* `MaterialReturns.tsx` (`heldOf` / `remainingOf`);
`material_returns_test.sql` step 6.

**MRN-7.** The cap is **enforced in the database**, not only in the form. A
return that would leave a level negative is rejected by a trigger, so no route
— API, import, another client — can drive hand stock negative through a return.
*Verified by:* `material_returns_test.sql` step 6 (three refusals: more than is
in hand, a spare never issued, and a line returning nothing at all) and step 7
(the level is unchanged by them).

**MRN-8.** A submission may carry **several spares**; they share one MRN and are
stored one row per returned item, numbered `row_no` 1..n within the submission.
A partially inserted MRN is deleted rather than left half-written.
*Verified by:* `addMaterialReturn()` in `src/lib/supabase.ts`;
`material_returns_test.sql` step 5.

**MRN-9. Numbering.** Each submission gets `MRN-YYMM-0001`, restarting each
month, assigned by the database (`next_mrn_uid()`), never by the client. The
engineer's own slip number is kept alongside as `mrn_no` — it is theirs, not
ours, and is not unique.
*Verified by:* `material_returns_test.sql` step 5.

**MRN-10. A return is a record, not something to edit.** Rows are immutable
once written; a mistake is corrected by a counter-movement, not by rewriting
history — the same rule the rest of the ledger follows.
*Verified by:* `material_returns_test.sql` step 10.

**MRN-11.** The line carries the context Stores needs to act on the parcel:
customer, report number, what it was removed from, the hand-stock note and free
remarks. None of them is required — a return must not be blocked by a field
nobody can fill.

---

## 4. The register — Spares → Material Returns (`/mrn`)

**MRN-12.** One row per returned item, newest first, with the MRN number and
date, the engineer, the spare (code and description as their own columns), Good
and Defective quantities, and the customer / report / removed-from context.

**MRN-13.** Totals across what is listed: returns, items, good and defective
quantities.

**MRN-14.** Filter by engineer, free-text search across every column, Export
CSV of exactly what is on screen, and paging.

**MRN-15.** Clicking a row opens the whole **submission** — every line of that
MRN together — because an MRN is what was sent in one parcel, not one item.

**MRN-16.** Hand Stock shows the other half: a **Returned** column and total, a
`Return` chip in the movement trail with its MRN number, and the drawer
arithmetic reading `stock out − consumed − transferred out + transferred in −
returned = on hand`.

---

## 5. Loading the sheet history

**MRN-17.** The sheet kept MRNs in **two tabs** — a form-data tab (one row per
submission: SI number, MRN No, MRN Date, engineer) and a register tab (one row
per item, repeating those header fields). Both are recognised by Data Import;
the register is the one that carries items and is **flattened to one row per
returned item**, keyed by its SI number so the submission stays grouped.
*Verified by:* dry run over the two supplied exports — the register's 602 rows
shape to 595 items across 270 submissions; the form-data tab shapes to none.

**MRN-18.** A recognised file with nothing to insert **says so**. Uploading the
form-data tab reports that it holds no returned items and names the register
tab, rather than reporting "0 rows" and leaving the user guessing.

**MRN-19.** Duplicate lines within one submission (the same spare twice, an
artefact of the sheet) are dropped; a row with no item is skipped; `NA` is
treated as blank.

**MRN-20. Imported history is exempt from the MRN-7 cap.** It predates the
ledger it would be checked against — a 2022 return has no 2022 dispatch to net
against — so rows marked `source = 'import'` load unchecked. Everything raised
in the app is `source = 'app'` and is checked.
*Verified by:* `material_returns_test.sql` step 8.

---

## 6. Access

**MRN-21.** Raising a return needs `stock.return`; the module needs
`mod:/mrn`. Both are granted to admin, engineer, RM, RGM, Spare Coordinator and
Stores Incharge, and `mod:/mrn` additionally to anyone who already has
`mod:/handstock` — a return is part of hand stock, so seeing one implies seeing
the other.
*Verified by:* `material_returns_test.sql` step 12.

**MRN-22.** Reading follows the same visibility as the rest of the ledger; the
guard functions the trigger uses are definer-rights and are **not** granted to
`authenticated`, so they cannot be called to probe another engineer's stock.

**MRN-23.** Deleting a return is an admin's correction path, not an engineer's.

---

## 7. Applying it

**MRN-24.** Ships inside `HandStock_X.sql` (generated by
`scripts/build-apply-bundles.mjs`; carries `0023_handstock.sql` then
`0039_material_returns.sql`). It is deliberately **not** a bundle of its own:
it adds a term to the same two views, so a later re-run of the hand-stock file
must carry it or it would redefine them back without returns.

**MRN-25.** `_status.sql` reports whether it is applied (row 17).

**MRN-26.** Applying SQL to the live project is the user's step. Merged is not
live.

---

## 8. Acceptance

`supabase/tests/material_returns_test.sql`, run after `_stub.sql` and every
migration against a throwaway Postgres, is the acceptance suite: 12 scenarios
covering the subtraction, the defective case, the movement and its reference,
the numbering, the three refusals, the unchanged level, the import exemption,
name matching, immutability, `engineer_stock_available()` and the grants. Only
the errors labelled `expect ERROR` may appear in its output.

`handstock_test.sql` and `stock_transfer_test.sql` must keep passing unchanged
— they are the check that adding the fifth term did not disturb the other four.

---

## 9. Known gaps / next

- **Stores receipt.** Nobody confirms the parcel arrived; the return takes
  effect the moment it is raised. If a hand-over should need acknowledgement,
  that is a received column on `material_returns`.
- **Defective disposition.** What happens to a defective unit after it reaches
  Stores (repair, scrap, RMA) is not modelled.
- **No warehouse credit.** Returned stock is not added anywhere, because Stores
  has no on-hand level to add it to (`HandStock_Req.md` §12).
