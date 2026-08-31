# Hand Stock — requirements

What the Hand Stock module is required to do, why each rule exists, and how each
one is proved. Written after the fact from the shipped implementation
(`0023_handstock.sql`, `src/modules/HandStock.tsx`, the consumption picker in
`src/modules/CallReporting.tsx`), so it describes what is live, not a proposal.

Requirements are numbered `HS-n` so a test, a review or a change request can
name one. **Verified by** points at the check that would fail if the
requirement broke.

---

## 1. Purpose and scope

A spare issued to a field engineer used to disappear from the system: Stores
dispatched it, the request closed, and nothing said what the engineer was
holding. Stock could not be counted, a consumed part could not be traced to the
issue that supplied it, and a report could consume a part nobody had ever
issued.

**In scope:** the stock level an engineer carries, per spare; the movements that
produce it; and the rule that a call report may only consume from it.

**Out of scope:** warehouse (Stores) stock levels — `parts` carries no on-hand
quantity; the engineer-to-engineer transfer *screen* itself, which is
`0020_stock_transfer.sql` and `/stock-transfer` (Hand Stock reads its data but
does not record transfers).

---

## 2. The stock level

**HS-1.** The stock level of one engineer for one spare is

```
Stock Level = Stock Out (from Stores) − Consumption
            − Stock Transfer From + Stock Transfer To
            − Returned to Stores (MRN)
```

The last term arrived with the MRN module; the four before it are the original
formula and are unchanged by it. See `MRN_Req.md`.

**HS-2.** Every term is stored beside the level, not folded into it. A figure
must be arguable: the register shows `stock_out`, `consumed`, `transferred_in`,
`transferred_out`, `returned` and `on_hand` on the same row.
*Verified by:* `handstock_balance` exposes all six columns;
`handstock_test.sql` step 6; `material_returns_test.sql` steps 1–3.

**HS-3.** Nothing is entered to maintain a stock level. All five movements
already exist elsewhere in the app; hand stock derives, never stores.
*Verified by:* `handstock_balance` and `handstock_movements` are views, not
tables — no INSERT path exists.

**HS-4. One derivation only.** `engineer_stock`, which the Stock Transfer screen
and its overdraw guard read, is a view over `handstock_balance`. The two screens
must not be able to disagree.
*Verified by:* `handstock_test.sql` step 9 joins the two and asserts they agree;
step 14 checks `engineer_stock_available()` returns the same figures;
`stock_transfer_test.sql` still passes against the redefined view.

---

## 3. What counts as a movement

### 3.1 Stock out (+)

**HS-5.** A spare counts as issued to the engineer when **Stores dispatches it**,
not when the engineer acknowledges it. It left on a DC and is in their hands
from that moment.
*Rationale:* acknowledgement needs `spare.receive`, which the role defaults do
not give every engineer; keying off the receipt would leave balances at zero.

**HS-6.** Dispatch is **per spare** (`spare_request_lines`, since
`0016_spare_line_approvals.sql`). A part-dispatched OR issues only the lines
actually sent.
*Verified by:* `handstock_test.sql` step 13.

**HS-7.** **Every** dispatched spare counts, whatever the request was raised for
— Call Based as well as HandStock. A spare dispatched against a call and then
consumed on it must net to zero, never to −1.
*Rationale:* the first derivation counted only `req_type = 'HandStock'`, so
call-based spares were consumed out of a balance they had never been added to;
the engineer went negative and the transfer guard then refused their legitimate
transfers.
*Verified by:* `handstock_test.sql` step 17.

**HS-8.** The **status** makes it a stock out, not the timestamp. Dispatches
carrying a DC but no `dispatched_at` — sheet-era rows, imports, anything from
before `0009` added the column — count, dated by the best timestamp the row has
(`l.dispatched_at → r.dispatched_at → l.created_at → r.created_at`).
*Verified by:* `handstock_test.sql` step 16.

### 3.2 Consumption (−)

**HS-9.** A spare consumed on a call report (`spare_consumption`) leaves hand
stock, dated by the consumption row.

### 3.3 Transfers (− out / + in)

**HS-10.** A hand-over recorded on Stock Transfer subtracts from the giving
engineer and adds to the receiving one, both dated by the transfer.
*Verified by:* `handstock_test.sql` steps 6 and 8.

### 3.4 Returns to Stores (−)

**HS-10a.** A spare returned to Stores on an MRN leaves hand stock, Good and
Defective quantities alike, dated by the MRN date. Hand Stock shows it as a
`Return` movement referenced by its MRN number. The rules around raising one —
the cap on what may be returned, the numbering, the register — are `MRN_Req.md`.
*Verified by:* `material_returns_test.sql` steps 2–4.

**HS-11.** Hand Stock does not police transfers — `0020_stock_transfer.sql`
owns the overdraw guard, the ST numbering and the "not to yourself" constraint.
Because of **HS-4**, that guard is checking the same figures this register
shows.
*Verified by:* `handstock_test.sql` step 7.

---

## 4. Matching

**HS-12. Engineer.** The four movements name engineers as free text from four
different screens, so they are matched on the name, trimmed and lower-cased
(`handstock_key()`). `"  ENG ELAN "` and `"Eng Elan"` are one engineer.
*Verified by:* `handstock_test.sql` step 4.

**HS-13. Spare.** A spare is stored as its catalogue string `CODE|Description`;
only the **CODE** identifies it (`part_code()`). A re-worded description must
not split one balance into two.
*Verified by:* `handstock_test.sql` step 5.

**HS-14.** The description shown is the one from a Stores dispatch where there
is one, since a consumption row may carry older wording.

**HS-15.** `spare_consumption` gained an `engineer_email` column and the report
form now writes it, so the match can move from name to email once the field has
been populated for a while. Historical rows have no email; the name remains the
join today.

**HS-16.** Rows with no engineer or no part code are excluded from the balance
entirely — they cannot be attributed to anyone.
*Verified by:* `handstock_test.sql` step 12.

---

## 5. Negative levels

**HS-17.** A level below zero is **shown, not clamped and not hidden**. It means
more was consumed or handed on than Stores ever issued — stock carried from
before this register, or a spare taken without a DC.
*Verified by:* `handstock_test.sql` step 10.

**HS-18.** The register gives those lines their own filter (**Short**) and a KPI
count, so they can be worked rather than discovered by accident.

---

## 6. The register — Spares → Hand Stock (`/handstock`)

**HS-19.** Two tabs over the same derivation:

| tab | shows |
| --- | --- |
| **Stock Level** | one line per engineer + spare: Engineer, Spare (code), Description, Stock level, Stock out, Consumed, Transfer in, Transfer out, Last movement |
| **Movements** | the ledger those levels are made of: When, Movement, Engineer, Spare, Description, Qty (signed), Reference, Against, Party / other engineer, Remarks |

**HS-20.** Stock Level filters: **In hand** (default) / **Short** / **Settled** /
**All**, plus a per-engineer selector and a search over engineer, part code and
description.

**HS-21.** Movements filters: a chip per movement kind (Stock out, Consumption,
Transfer in, Transfer out), a per-engineer selector applied **server-side**, and
a search over engineer, spare, DC, call, party and remarks.

**HS-22.** KPI tiles: units in the field, engineers holding, spares held, stock
out, consumed, short.

**HS-23. Movement trail.** Clicking a Stock Level line opens every movement
behind it — each stock out with its DC, each consumption with its call, each
transfer with the engineer on the other side — and spells out the arithmetic
(`4 − 2 − 1 + 0 = 1`). A disputed figure must be readable back to its source.

**HS-24.** Both tabs export to CSV; the Movements tab pages (1000 rows) rather
than pulling the whole ledger, because a level is a handful of rows per engineer
and its history is not.

**HS-25.** Recording a hand-over is **not** done here: the register links to
`/stock-transfer` for anyone holding `stock.transfer`. One place to record a
transfer, one place to read a level.

**HS-26.** When the migration has not been applied, the module says exactly that
and names the bundle, rather than showing an empty table or a raw Postgres
error.

---

## 7. Reporting — consumption comes out of hand stock

**HS-27.** The spare picker on a call report offers **only what that engineer is
holding**, each with the quantity in hand. It used to be the whole ITEM master,
which is precisely how consumption drifted away from what Stores had issued.

**HS-28.** A quantity may not exceed what is in hand, counted **across the lines
already added to this visit** — adding the same spare twice cannot overdraw it.

**HS-29.** The picker follows the visiting-engineer selector: an admin reporting
for someone else sees that person's stock, not their own.

**HS-30.** Anything not in hand must be raised as a spare request. There is no
override in the form.

---

## 8. Access

**HS-31.** `handstock_movements` and `handstock_balance` are `security_invoker`
views: a user sees exactly the rows the underlying tables already allow them —
an engineer their own stock, an RM their reporting sub-tree, an admin everyone.
No new visibility is created.

**HS-32.** The module is gated by `mod:/handstock`, granted additively to every
role that can already open the Spare Requests register. An admin can revoke it
per role afterwards.
*Verified by:* `handstock_test.sql` step 15.

**HS-33.** `handstock_on_hand()` reads with the definer's rights (the transfer
guard must see stock the caller may not) and is therefore **not** granted to
`authenticated` — otherwise anyone could ask what any engineer is holding. The
app reads the RLS-scoped view instead.

---

## 9. Non-functional

**HS-34.** Netting happens in Postgres, not the browser. The register loads one
aggregated row per engineer + spare.

**HS-35.** The register uses the app's standard local cache with a 30-minute
auto-sync, "synced X ago" and a manual refresh, like every other list view.

**HS-36.** The migration is idempotent: applying `HandStock_X.sql` twice is a
no-op.

**HS-37.** Hand stock adds **no data of its own** to purge or reload before
go-live — the level rebuilds itself once the ledgers underneath are loaded (see
the go-live section of `docs/BACKLOG.md`).

---

## 10. Applying it

**HS-38.** Ships as `HandStock_X.sql` at the repo root (generated by
`scripts/build-apply-bundles.mjs`; carries `0023_handstock.sql` and
`0039_material_returns.sql`), ending with
the read queries — commented out — for checking a stock level.

**HS-39.** Prerequisites, named by its preflight rather than failing part-way:
the spare workflow through per-spare approvals (`Spare_1.sql`) and the
stock-transfer tables (`supabase/apply/stock_transfer.sql`). `_status.sql`
reports whether it is applied.

**HS-40.** Applying SQL to the live project is the user's step. Merged is not
live.

---

## 11. Acceptance

`supabase/tests/handstock_test.sql`, run after `_stub.sql` and every migration
against a throwaway Postgres, is the acceptance suite: 17 scenarios covering all
four terms, partial dispatch, the call-based case, the undated legacy dispatch,
name and part-code matching, the transfer guards, the negative case, exclusions,
the grants, and that `engineer_stock` agrees with `handstock_balance`. Only the
errors labelled `expect ERROR` may appear in its output.

`material_returns_test.sql` is the acceptance suite for the fifth term, and
`stock_transfer_test.sql` must keep passing unchanged — it is the check that
redefining `engineer_stock` did not break the screen that depends on it.

---

## 12. Known gaps / next

- **Warehouse stock.** Stores' own balance is not modelled; `parts` has no
  on-hand column. Decrement-on-dispatch and a pick/pack view wait on that.
- **Transfer acceptance.** A transfer takes effect immediately; there is no
  step where the receiving engineer confirms. If hand-overs should need one,
  that is an acknowledgement column on `stock_transfers`.
- **Consumption reconciliation.** "Received a spare, never consumed it against
  the call" is now a filter over this data (cookbook query 6 in
  `HandStock_X.sql`) rather than a separate report.
- **Matching on email.** Once `spare_consumption.engineer_email` has been
  populated for a while, the join can move off the name (HS-15).
