# Warranty & Contract — AppSheet against here, field by field

**The four tables asked for**, both parents and both children:

| AppSheet table | Sheet | Here |
| --- | --- | --- |
| `WarrantySale` | `SaleEntry` | `sale_entries` — **Warranty Register → Entries** |
| `WarrantySaleDetails` | `WarrantySaleDetails` | `sale_items` — the machine lines |
| `ContractEntry` | `ContractEntry` | `contract_entries` — **Contract Register → Entries** |
| `ContractDetails` | `ContractDetails` | `contract_items` — the machine lines |

**Sources, and they are two.** `docs/APPSHEET_ADMIN_APPDEF.md` §3.5–3.8 records
the AppSheet column properties from `Admin_AppDef.pdf` — types, App formulas,
Initial values, valid-if. It does **not** record the spreadsheet formulas behind
the sheet-side columns; for those the PDF says only *"spreadsheet formula …
emits values including …"*. `Appsheet - Forms.xlsx — Formula Reference` prints
those, and §3.4a of that document now records the ones that matter here.

Shareable copy: <https://claude.ai/code/artifact/09231279-fa36-41b1-ab7e-c24af8d3b7bb>

**How to read the verdict column.**

| | |
| --- | --- |
| ✅ | carried, same rule |
| ➕ | carried, and the formula file **changed what it does** |
| ↳ | on a machine line: **inherited from the entry**, pinned only if typed |
| ⚙️ | the database answers it (a key, a stamp, a generated column) |
| ➖ | deliberately not carried, with the reason |
| ⚠️ | **a real gap** |

---

## 1 · Warranty Sale Entry — `WarrantySale` → `sale_entries`

31 AppSheet columns.

| # | AppSheet column | Rule in AppSheet / on the sheet | Here | |
| --- | --- | --- | --- | --- |
| 1 | `_RowNumber` | the spreadsheet row | `id` (identity) | ⚙️ |
| 2 | `SA Number` | `CONCATENATE("SA",[_RowNumber]+1183)` | `sa_number`; offered from the **highest already issued**, floor 1183 | ➖ |
| 3 | `Timestamp` | `NOW()` | `entry_at`, shown as **Sale Entry Date** | ✅ |
| 4 | `Party Name` | Enum | `party_name` | ✅ |
| 5 | `Sold Through` | Initial value `LOOKUP` into PartyMaster, emits `CUSTOMER` | `sold_through` — typed, not looked up | ⚠️ |
| 6 | `INVOICE NO` | Text | `invoice_no` | ✅ |
| 7 | `INVOICE DATE` | Date | `invoice_date` | ✅ |
| 8 | `Warranty Start Date` | Initial value `TODAY()` | `warranty_start` — **starts blank** | ⚠️ |
| 9 | `Warranty Period (in Years)` | `[Warranty Period (in Months)] / 12` | `warranty_years`, `periodYears()` | ✅ |
| 10 | `Warranty End Date` | `EOMONTH(start, months-1)+DAY(start)-1` | `warranty_end`, `periodEnd()` — proved equal over 80 start/period pairs incl. 31 Jan and 29 Feb | ✅ |
| 11 | `PM VISITS` | `([Warranty Period (in Months)] / 12) * 3` | `pm_visits`, `warrantyPmVisits()` | ✅ |
| 12 | `Other Details` | Text | `other_details` | ✅ |
| 13 | `Warranty Period (in Months)` | Number — the field you type | `warranty_months` | ✅ |
| 14 | `WARRANTY STATUS` | **`SaleEntry M2`** `=IF(I>=Today(),IF(I<=(Today()+30),"ABOUT TO EXPIRE","ACTIVE"),"INACTIVE")` | the live state is `warranty_state`, from `cover_state()` — **now thirty days** (0187). `warranty_status` keeps the text as imported | ➕ |
| 15 | `Type` | Number (CUSTOMER / DEALER) | `party_type` | ✅ |
| 16 | `Profile` | hidden | `profile` | ✅ |
| 17 | `COUNTRY` | hidden | `country` | ✅ |
| 18 | `State` | hidden | `state` | ✅ |
| 19 | `City` | hidden | `city` | ✅ |
| 20 | `Service Engineer - Initial` | hidden | `engineer` | ✅ |
| 21 | `Address` | hidden | `address` | ✅ |
| 22 | `Inst. Pincode` | hidden | `pincode` | ✅ |
| 23 | `Tel 1` | hidden | `tel1` | ✅ |
| 24 | `Tel 2` | hidden | `tel2` | ✅ |
| 25 | `PAN` | hidden | `pan` | ✅ |
| 26 | `GST` | hidden | `gst` | ✅ |
| 27 | `TAX` | hidden | `tax` | ✅ |
| 28 | `Products` | `REF_ROWS("WarrantySaleDetails","SA Number")` | the machine lines in the entry drawer | ✅ |
| 29 | `Installation Calls` | `FILTER("INSTCalls",[Warranty Number]=[SA Number])` | not carried — installation calls are their own module here | ➖ |
| 30 | `Related WarrantySaleDetails` | `REF_ROWS("WarrantySaleDetails","PM VISITS")` | not carried. A ref pointed at a **number** column; it lists every line sharing a visit count, which is not a relationship | ➖ |
| 31 | `Related …By SA Number` | `REF_ROWS("WarrantySaleDetails","SA Number")` | same list as 28 | ➖ |

---

## 2 · Warranty Sale Details — `WarrantySaleDetails` → `sale_items`

33 AppSheet columns. **↳ means the value is not stored on the line at all
unless somebody pins it** — it follows the entry, so editing the entry moves
every machine under it.

| # | AppSheet column | Rule in AppSheet / on the sheet | Here | |
| --- | --- | --- | --- | --- |
| 1 | `_RowNumber` | | `id` | ⚙️ |
| 2 | `Priority` | **`A3`** `=IF(LEN(E3)<1,"",1)` | **removed** (0.9.243). A constant that sorts the four sheets when merged; it says nothing about the record | ➖ |
| 3 | `Item Details Long` | `CONCATENATE([Product Code],"\|",[Product Name],"\|",[Product Serial Number])` | `itemDetailsLong()` — computed, not stored. It is the key into Product Master | ➖ |
| 4 | `Item Details` | **`C3`** `=J3&"\|"&L3` → **Name \| Serial** | `itemDetails()` — **new**, now transcribed; computed, not stored | ➕ |
| 5 | `SA Number` | Ref to `WarrantySale` | `sa_number` (foreign key, cascade) | ✅ |
| 6 | `Sale Entry Date` | `NOW()` | no column on `sale_items`; `created_at` answers it | ➖ |
| 7 | `Party Name` | `LOOKUP … WarrantySale` | header's `party_name` | ↳ |
| 8 | `Sold Through` | lookup | `sold_through` | ↳ |
| 9 | `INVOICE NO` | lookup | `invoice_no` | ↳ |
| 10 | `INVOICE DATE` | lookup; Initial `TODAY()` | `invoice_date` | ↳ |
| 11 | `Product Name` | valid-if `ProductList[Product Name]` | `product_name` — **typed, no picker** | ⚠️ |
| 12 | `Product Code` | valid-if `ProductList[Product Code]` | `product_code` — **typed, no picker** | ⚠️ |
| 13 | `Product Serial Number` | Text | `serial_number` | ✅ |
| 14 | `Warranty Start Date` | lookup | `warranty_start` | ↳ |
| 15 | `Warranty Period (in Years)` | lookup | `warranty_years` | ↳ |
| 16 | `Warranty End Date` | lookup | `warranty_end` | ↳ |
| 17 | `PM VISITS` | lookup | `pm_visits` | ↳ |
| 18 | `ACCESSORIES INCLUDED?` | Yes/No | `accessories_included` | ✅ |
| 19 | `CONSUMABLE INCLUDED?` | Yes/No | `consumable_included` | ✅ |
| 20 | `CONTRACT PRICE FIXED?` | Text | `contract_price_fixed` (boolean) | ✅ |
| 21 | `Other Details` | Initial from `WarrantySale` | `other_details` | ↳ |
| 22 | `Already Sold TO` | Initial: `Party Name` from Product Master via `Item Details Long` | `already_sold_to` | ✅ |
| 23 | `WARRANTY STATUS` | **`V2`** `=IF(O>=Today(),IF(O<=(Today()+30),…))` | `warranty_state` on the view — **now thirty days** | ➕ |
| 24 | `Warranty Period (in Months)` | lookup | `warranty_months` | ↳ |
| 25 | `Replacement UNIT?` | Yes/No, Initial `No` | `replacement_unit` | ✅ |
| 26 | `Replacement Unit SL NO` | valid-if Product Master when Replacement = Yes | `replacement_unit_sl` — typed, and the conditional valid-if is not enforced | ⚠️ |
| 27 | `Added By` | `USEREMAIL()` | `added_by` | ✅ |
| 28 | `STATE` | `VLOOKUP(PartyName, PartyMaster,5,0)` | header's `state` | ↳ |
| 29 | `CITY` | `VLOOKUP(…,6,0)` | header's `city` | ↳ |
| 30 | `ENGINEER` | `VLOOKUP(…,31,0)` | header's `engineer` | ↳ |
| 31 | `Add Call` | **`AD2`** `=if(LEN(U)<2,"WI-","RWI-")`, `U` = *Already Sold TO* | `add_call` — **now fills itself** from Already Sold To | ➕ |
| 32 | `INST Call` | `VLOOKUP` chain into `INSTDetails-OLD Calls` / `InstallationDetails` | `inst_call` — kept as imported; the lookup chain is not re-run here | ➖ |
| 33 | `LINK` | main-product / accessory linkage | not carried — there is no accessory-link table here | ➖ |

---

## 3 · Contract Entry — `ContractEntry` → `contract_entries`

15 AppSheet columns.

| # | AppSheet column | Rule in AppSheet / on the sheet | Here | |
| --- | --- | --- | --- | --- |
| 1 | `_RowNumber` | key in AppSheet | `id` | ⚙️ |
| 2 | `MC Number` | `CONCATENATE("MC",13+[_RowNumber])` | `mc_number`; offered from the **highest already issued**, floor 13 | ➖ |
| 3 | `Contract Entry Date` | `NOW()` | `entry_at` | ✅ |
| 4 | `Party Name` | valid-if `Product Master[Party Name]` | `party_name` — **typed, no picker** | ⚠️ |
| 5 | `Payment Schedule` | Enum: Yearly, Half Yearly, Quarterly, **Monthly** | `payment_schedule` — **Monthly was missing and is now there** | ➕ |
| 6 | `Bill Generate At` | Enum: Beginning / End Of Period | `bill_generate_at` | ✅ |
| 7 | `Contract Type` | Enum: CMC, AMC | `contract_type` | ✅ |
| 8 | `Contract Start Date` | Initial `TODAY()` | `contract_start` — **starts blank** | ⚠️ |
| 9 | `Contract Period (Years)` | `[Contract Period (Months)] / 12` | `contract_years`, `periodYears()` | ✅ |
| 10 | `Contract End Date` | `EOMONTH(start, months-1)+DAY(start)-1` | `contract_end`, `periodEnd()`; stays typeable, so a part-month contract is possible | ✅ |
| 11 | `P M Visits (TOTAL)` | `[Contract Period (Months)] / 6` | `pm_visits_total`, `contractPmVisits()` — **a different rate from warranty's three a year**, and the two are easy to conflate | ✅ |
| 12 | `Contract Period (Months)` | the field you type | `contract_months` | ✅ |
| 13 | `Status` | **`L2`** `=IF(I>=Today(),IF(I<=(Today()+30),…))` | `contract_state` from `cover_state()` — **now thirty days**. `status` keeps the text as imported | ➕ |
| 14 | `Prev MC Number` | Text | `prev_mc_number` — and it is **written by the renewal flow**, which raises the next MC from an expiring one | ✅ |
| 15 | `Products` | `REF_ROWS("ContractDetails","MC Number")` | the machine lines in the entry drawer | ✅ |

---

## 4 · Contract Details — `ContractDetails` → `contract_items`

31 AppSheet columns.

| # | AppSheet column | Rule in AppSheet / on the sheet | Here | |
| --- | --- | --- | --- | --- |
| 1 | `_RowNumber` | | `id` | ⚙️ |
| 2 | `UID` | `UNIQUEID()`, key | `uid` — filled by `cover_item_uid`, never by the client | ⚙️ |
| 3 | `Priority` | **`B2`** `=IF(LEN(F2)<1,"",2)` | **removed** (0.9.243) | ➖ |
| 4 | `Item Details Long` | **`C2`** `=O2` — it **is** `Product Details` | `itemDetailsLong()` — computed, not stored | ➖ |
| 5 | `Item Details` | **`D2`** `=Q2&"\|"&R2` → **Name \| Serial** | `itemDetails()` — **new**; computed, not stored | ➕ |
| 6 | `MC Number` | Text | `mc_number` (foreign key, cascade) | ✅ |
| 7 | `Contract Entry Date` | `NOW()` | `entry_at` — the column exists and is **not on the form** | ⚠️ |
| 8 | `Party Name` | `LOOKUP([_THISROW].[MC Number], ContractEntry, …)` | header's `party_name` | ↳ |
| 9 | `Payment Schedule` | lookup | `payment_schedule` | ↳ |
| 10 | `Bill Generate At` | lookup | `bill_generate_at` | ↳ |
| 11 | `Contract Type` | lookup | `contract_type` | ↳ |
| 12 | `Contract Start Date` | lookup | `contract_start` | ↳ |
| 13 | `Contract Period (Years)` | `[Contract Period (Months)] / 12` | `contract_years` | ↳ |
| 14 | `Contract End Date` | lookup / `EOMONTH(…)` | `contract_end` | ↳ |
| 15 | `P M Visits (TOTAL)` | lookup | `pm_visits_total` | ↳ |
| 16 | `Product Details` | valid-if `Product Master[Item Details Long]` — **the picker the three below are split out of** | **no field feeds it.** `splitProductDetails()` exists and is tested; the screen types code, name and serial instead | ⚠️ |
| 17 | `Product Code` | `INDEX(SPLIT([Product Details],"\|"),1)` | `product_code` — typed | ⚠️ |
| 18 | `Product Name` | `INDEX(…,2)` | `product_name` — typed | ⚠️ |
| 19 | `Product Serial Number` | `INDEX(…,3)` | `serial_number` — typed | ⚠️ |
| 20 | `Rate` | Number | `rate` | ✅ |
| 21 | `Item Tax Amount` | `((18 * [Rate])/100)` | `item_tax_amount`, `itemTaxAmount()` | ✅ |
| 22 | `Total After Tax` | `([Rate]+[Item Tax Amount])` | `total_after_tax` | ✅ |
| 23 | `Contract Period (Months)` | lookup | `contract_months` | ↳ |
| 24 | `Status` | **`W2`** `=IF(M>=Today(),IF(M<=(Today()+30),…))` | `contract_state` — **now thirty days** | ➕ |
| 25 | `Present Item Status` | `Item Status` from Product Master via `Item Details Long` | `present_item_status`; `sync_product_cover()` keeps Product Master in step from this side | ✅ |
| 26 | `Last Contract Number` | from Product Master | `last_contract_number` — written by the renewal flow | ✅ |
| 27 | `Last Contract End Date` | from Product Master | `last_contract_end` | ✅ |
| 28 | `SA Number` | `Warranty Number` from Product Master | `sa_number` | ✅ |
| 29 | `SA End Date` | `Warranty End Date` from Product Master | `sa_end_date` | ✅ |
| 30 | `Added By` | `USEREMAIL()` | `added_by` | ✅ |
| 31 | `LINK` | main-product / accessory linkage | not carried | ➖ |

---

## What the formula file actually changed

**1 · "About to expire" is thirty days, not sixty.** `0036_sales_contracts.sql`
had to pick a threshold and picked 60, saying in the file that the number was
this application's rather than the sheet's — because the PDF names what these
columns can *say* and withholds the rule. All four sheets state the same rule and
it is 30. **This is not cosmetic**: the registers filter and count by it, so a
contract with 45 days left was listed as about to expire and chased a month early.

It also turned out to be written down in **three** places — `cover_state()` in
SQL, `coverStatus()` in `coverspec.ts` (which nothing used), and a fourth
hand-rolled copy inside the register screen. The Entries tab and the Machines tab
could therefore have labelled one contract two different ways. There is one
implementation now, and `check:ui` reads the number back out of the apply bundle
and fails if the SQL and the TypeScript disagree.

**2 · `Monthly` was missing from Payment Schedule** — three of the sheet's four
values had been transcribed, and the field takes no free-text fallback, so a
monthly contract could not be keyed at all.

**3 · `Add Call` fills itself** — `WI-` for a machine nobody has owned, `RWI-`
where *Already Sold To* names somebody.

**4 · `Item Details` is Name \| Serial**, on both detail sheets, and is **not**
`Item Details Long` (Code \| Name \| Serial). Two strings four characters apart in
the name, and `ContractDetails C2 = O2` confirms the second is the same value as
`Product Details` — which is what makes the `INDEX(SPLIT(…),1..3)` order certain
rather than assumed.

**5 · `Priority` is confirmed as sheet row-ordering** — a constant per sheet
(1, 2, 3, 1), blanked on an empty row, sorting the four sheets against each other
when merged. It carries nothing about the record, which is what 0.9.243 removed.

## The gaps, in the order they are worth fixing

1. **The `Product Details` picker on Contract Details** (⚠️ 16–19). A machine
   should be chosen from Product Master, not typed three times. The splitter is
   written and tested; nothing feeds it. **This needs a decision, not just work:**
   whether a contract may cover a machine the master has never heard of.
2. **`Product Name` / `Product Code` on Warranty Sale Details** (⚠️ 11–12) —
   AppSheet validates both against `ProductList`. A sale names a machine that may
   be new, so this one is not obviously the same answer as (1).
3. **`Contract Entry Date` on a contract machine line** (⚠️ 7) — the column is
   there and the form does not show it.
4. **`Sold Through`'s PartyMaster lookup** (⚠️ Sale Entry 5) and the **`TODAY()`
   start dates** (⚠️ Sale Entry 8, Contract Entry 8). Small, and a defaulted
   start date is the kind of value that reaches a record because it was already
   in the box — worth asking for rather than assuming.
5. **`Replacement Unit SL NO`'s conditional valid-if** (⚠️ Details 26).

Nothing in this list is a data-loss fault; every one of them is a field somebody
can still type correctly.
