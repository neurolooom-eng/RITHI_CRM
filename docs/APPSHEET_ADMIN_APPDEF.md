# Service2.0 Admin — Source-Grounded Review

**Source:** `Admin_AppDef.pdf`  
**Document title:** `Service2OAdmin-3911373 Documentation`  
**Generated at:** `9/13/2026, 4:08:44 PM`  
**App:** `Service2.0 Admin`  
**Pages reviewed:** 1–150 (all pages in the supplied PDF)

> **Fidelity rule used for this file:** Only information visible in the supplied PDF is recorded. Nothing has been added from general AppSheet knowledge or inferred from missing context. Where a formula/value is not fully legible in the source image, it is not reconstructed.

---

## 1. App-level summary

### Data Summary
- 24 Tables
- 587 Columns
- 5 Slices

### UX Summary
- 65 Views
- 9 Format Rules

### Behavior Summary
- 98 Actions
- 0 Workflow Rules

### App properties
| Property | Value |
|---|---|
| Short Name | Service2.0 Admin |
| Version | 1.000885 |
| Default app folder | `/appsheet/data/Service2OAdmin-3911373` |
| Function | Field Service |
| Runnable? | Yes |
| Deployable? | No |
| Personal use only? | No |

---

## 2. Tables listed in the PDF

The PDF lists the following 24 tables.

1. `_Per User Settings`
2. `EngineerList`
3. `SPARES`
4. `0.ProductSearch`
5. `ContractDetails`
6. `ContractEntry`
7. `WarrantySale`
8. `WarrantySaleDetails`
9. `ProductList`
10. `INSTCalls`
11. `Product Master`
12. `PartyMaster`
13. `OwnershipTransfer`
14. `10ENGGREQ`
15. `PartyList`
16. `SolvedInstCall`
17. `31 OR Register`
18. `34AdminApproval`
19. `2023-CRNRequest`
20. `Reports`
21. `InstallationDetails`
22. `Product-Accessory`
23. `City List`
24. `INST`

### Table-level configuration visible in pages 2–12

| Table | Visible? | Shared? | Locale | Updates | Source Path | Worksheet / Qualifier | Data Source |
|---|---|---:|---|---|---|---|---|
| `_Per User Settings` | NEVER | No | en-US | UPDATES_ONLY | `_Per User Settings` | — | native |
| `EngineerList` | ALWAYS | Yes | en-US | READ_ONLY | User Master | User Master | google |
| `SPARES` | ALWAYS | Yes | en-GB | READ_ONLY | ITEM Master | ITEM Master | google |
| `0.ProductSearch` | ALWAYS | Yes | en-US | ADDS_ONLY | Product Search Form (Responses) | ProductSearch | google |
| `ContractDetails` | ALWAYS | Yes | en-GB | ALL_CHANGES | Appsheet - Forms | ContractDetails | google |
| `ContractEntry` | ALWAYS | Yes | en-GB | ADDS_AND_UPDATES | Appsheet - Forms | ContractEntry | google |
| `WarrantySale` | ALWAYS | Yes | en-GB | ALL_CHANGES | Appsheet - Forms | SaleEntry | google |
| `WarrantySaleDetails` | ALWAYS | Yes | en-GB | ALL_CHANGES | Appsheet - Forms | WarrantySaleDetails | google |
| `ProductList` | ALWAYS | Yes | en-GB | READ_ONLY | Appsheet - Forms | ProductList | google |
| `INSTCalls` | ALWAYS | Yes | en-GB | READ_ONLY | `26 v1 - F_I Call Register` | `INST_All` | google |
| `Product Master` | ALWAYS | Yes | en-GB | READ_ONLY | Appsheet - Forms | ProdMaster | google |
| `PartyMaster` | ALWAYS | Yes | en-GB | ADDS_AND_UPDATES | Appsheet - Forms | PartyMaster | google |
| `OwnershipTransfer` | ALWAYS | Yes | en-GB | ALL_CHANGES | Appsheet - Forms | OwnershipTransfer | google |
| `10ENGGREQ` | ALWAYS | Yes | en-GB | UPDATES_ONLY | Engg CRN Registration (Responses) | Data-2026 | google |
| `PartyList` | ALWAYS | Yes | en-US | ADDS_ONLY | Product Search Form (Responses) | PartyList | google |
| `SolvedInstCall` | ALWAYS | Yes | en-GB | READ_ONLY | Appsheet - Forms | SolvedInstCall | google |
| `31 OR Register` | ALWAYS | Yes | en-GB | READ_ONLY | 26_SpareRequest | v2_OR_Req | google |
| `34AdminApproval` | ALWAYS | Yes | en-GB | ADDS_ONLY | 26_SpareRequest | v2_AdminApproval | google |
| `2023-CRNRequest` | ALWAYS | Yes | en-GB | READ_ONLY | Engg CRN Registration (Responses) | 2023-CRNRequest | google |
| `Reports` | ALWAYS | Yes | en-US | READ_ONLY | Call Register | Folder as a Table | google |
| `InstallationDetails` | ALWAYS | Yes | en-GB | ALL_CHANGES | Appsheet - Forms | InstallationDetails | google |
| `Product-Accessory` | ALWAYS | Yes | en-GB | ALL_CHANGES | Appsheet - Forms | MainProduct-Accessory | google |
| `City List` | ALWAYS | Yes | en-US | READ_ONLY | City List | City List | google |
| `INST` | ALWAYS | Yes | en-GB | ADDS_AND_UPDATES | `26 v1 - F_I Call Register` | INST | google |

The table pages also show `Column Order List = _RowNumber` and no partitioning across multiple files/sources or worksheets for the listed Google-backed tables.

---

# 3. Column/schema details shown in the PDF

## 3.1 `_Per User Settings_Schema`

Visible columns:

1. `_RowNumber` — Number; system-defined/key metadata is shown; hidden.
2. `_EMAIL` — Email; App formula `USEREMAIL()`; hidden.
3. `_NAME` — Name; App formula `USERNAME()`; hidden.
4. `_LOCATION` — LatLong; hidden.
5. `Options Heading` — Show; hidden; content text shown as “These options control the content and behavior of the app.”
6. `Option 1` — Text; hidden.
7. `Option 2` — Number; hidden.
8. `Country Option` — Enum; visible enum values include `Australia`, `Brazil`, `Canada`; hidden.
9. `Language Option` — Enum; visible enum values include `English`, `French`, `Tamil`; hidden.
10. `Option 5` — Text; hidden.
11. `Option 6` — Number; hidden.
12. `Option 7` — Text; hidden.
13. `Option 8` — Text; hidden.
14. `Option 9` — Text; hidden.
15. `_THISUSER` — Text; Initial value `onlyvalue`; key = Yes; hidden.

---

## 3.2 `EngineerList_Schema`

Visible columns:

1. `_RowNumber` — Number; read-only; hidden; key shown as Yes.
2. `User Name` — Name; spreadsheet formula shown as `"COMPUTED_VALUE"`.
3. `MAIL ID` — Email; read-only; spreadsheet formula uses `ArrayFormula`, `VLOOKUP`, `IFERROR`, and `EMAIL ID` matching.
4. `REGION` — Text; read-only; spreadsheet formula uses `ArrayFormula`, `VLOOKUP`, `Winmax`, and `MATCH`.
5. `RGM as per WINMAX` — Text; read-only; spreadsheet formula uses `ArrayFormula`, `VLOOKUP`, `Winmax`, and `MATCH`.
6. `User Name_5` — Name; read-only; spreadsheet formula shown as `=ArrayFormula(RC[-4]:R[99]C[-4])` in the report image.
7. `AL Mail ID` — Email; read-only; spreadsheet formula uses `ArrayFormula`, `IFERROR`, `IF`, `LEN`, `VLOOKUP`, `Winmax`.
8. `RM EMAIL ID` — Email; read-only; spreadsheet formula uses `ArrayFormula`, `IFERROR`, `VLOOKUP`, and `GmailID`.
9. `Regional Manager` — Email; read-only; spreadsheet formula uses `ArrayFormula`, `IFERROR`, `VLOOKUP`, and `Regional Manager`.

Several email/region-related fields are marked searchable and/or sensitive in the PDF.

---

## 3.3 `SPARES_Schema`

Visible columns:

1. `_RowNumber` — Number; read-only; hidden; key = Yes.
2. `Item Details` — Text; read-only; spreadsheet formula concatenates source columns when a referenced cell is non-empty.
3. `S. No.` — Number; read-only; spreadsheet formula auto-numbers rows based on populated data.
4. `PRODUCT` — Text.
5. `Item Code` — Text; spreadsheet formula `"COMPUTED_VALUE"`.
6. `Item Name` — Name; read-only; spreadsheet formula `"COMPUTED_VALUE"`; marked sensitive.
7. `Active/Inactive?` — Text.
8. `Spare / Consumable` — Text.
9. `Purchase Cost` — Price.
10. `Purchase Cost (F)` — Price; spreadsheet formula uses `ArrayFormula(IFERROR(VLOOKUP(...,PriceC1:C3,3,0),""))`.
11. `Added On` — Decimal.
12. `Added By` — Text.
13. `Modified On` — Text.
14. `Set to Inactive On` — Decimal.

---

## 3.4 `0.ProductSearch_Schema`

Visible columns:

1. `_RowNumber` — Number; read-only; hidden; key = Yes.
2. `Timestamp` — DateTime; Initial value `NOW()`.
3. `Product Name` — Name; valid-if references `Product Master[Item Name]`.
4. `Product Serial No` — Text; valid-if references `Product Master[Product Serial Number]`.
5. `Email Address` — Email; Initial value `USEREMAIL()`.

---

## 3.5 `ContractDetails_Schema`

Visible columns:

1. `_RowNumber` — Number; read-only; hidden.
2. `UID` — Text; Initial value `UNIQUEID()`; key = Yes.
3. `Priority` — Number; read-only; hidden; spreadsheet formula auto-sequences populated rows.
4. `Item Details Long` — Text; read-only; hidden; spreadsheet formula copies another source column.
5. `Item Details` — Text; read-only; hidden; spreadsheet formula concatenates multiple source values.
6. `MC Number` — Text.
7. `Contract Entry Date` — DateTime; Initial value `NOW()`.
8. `Party Name` — Enum; App formula uses `LOOKUP([_THISROW].[MC Number], ContractEntry, MC Number, Party Name)`.
9. `Payment Schedule` — Text; App formula looks up `Payment Schedule` from `ContractEntry` by `MC Number`.
10. `Bill Generate At` — Text; App formula looks up `Bill Generate At` from `ContractEntry` by `MC Number`.
11. `Contract Type` — Text; App formula looks up `Contract Type` from `ContractEntry` by `MC Number`.
12. `Contract Start Date` — Date; App formula looks up `Contract Start Date` from `ContractEntry` by `MC Number`.
13. `Contract Period (Years)` — Decimal; App formula `[Contract Period (Months)] / 12`.
14. `Contract End Date` — Date; App formula looks up `Contract End Date`; Initial value shown as `EOMONTH([Contract Start Date], (([Contract Period (Years)]*12)-1))+DAY([Contract Start Date])-1`.
15. `P M Visits (TOTAL)` — Number; App formula looks up `P M Visits (TOTAL)` from `ContractEntry` by `MC Number`.
16. `Product Details` — Text; valid-if references `Product Master[Item Details Long]`.
17. `Product Code` — Text; App formula `INDEX(SPLIT([Product Details],"|"),1)`.
18. `Product Name` — Text; App formula `INDEX(SPLIT([Product Details],"|"),2)`.
19. `Product Serial Number` — Text; App formula `INDEX(SPLIT([Product Details],"|"),3)`.
20. `Rate` — Number.
21. `Item Tax Amount` — Decimal; Initial value `((18 * [Rate])/100)`.
22. `Total After Tax` — Decimal; Initial value `([Rate]+[Item Tax Amount])`.
23. `Contract Period (Months)` — Number; App formula looks up `Contract Period (Months)` from `ContractEntry` by `MC Number`.
24. `Status` — Text; read-only; hidden; spreadsheet formula evaluates date/status and emits values including `ABOUT TO EXPIRE`, `ACTIVE`, `INACTIVE`.
25. `Present Item Status` — Text; App formula looks up `Item Status` from `Product Master` using `Item Details Long`.
26. `Last Contract Number` — Text; App formula looks up `Contract Number` from `Product Master` using `Product Details` / `Item Details Long`.
27. `Last Contract End Date` — Date; App formula looks up `Contract End Date` from `Product Master`.
28. `SA Number` — Text; App formula looks up `Warranty Number` from `Product Master`.
29. `SA End Date` — Date; App formula looks up `Warranty End Date` from `Product Master`; Initial value `TODAY()`.
30. `Added By` — Email; Initial value `USEREMAIL()`; hidden.
31. `LINK` — Text; App formula conditionally emits `Concatenate Main Prod` / `Add` / `Linked` style text based on a lookup into product/accessory data.

---

## 3.6 `ContractEntry_Schema`

Visible columns:

1. `_RowNumber` — Number; read-only; hidden; key = Yes.
2. `MC Number` — Text; Initial value `CONCATENATE("MC",13+[_RowNumber])`; key = Yes.
3. `Contract Entry Date` — DateTime; Initial value `NOW()`.
4. `Party Name` — Name; valid-if references `Product Master[Party Name]`.
5. `Payment Schedule` — Enum; visible enum values include `Yearly`, `Half Yearly`, `Quarterly`, `Monthly`.
6. `Bill Generate At` — Enum; visible values include `Beginning Of Period`, `End Of Period`.
7. `Contract Type` — Enum; visible values include `CMC`, `AMC`.
8. `Contract Start Date` — Date; Initial value `TODAY()`.
9. `Contract Period (Years)` — Decimal; App formula `[Contract Period (Months)] / 12`; Initial value also shown as `[Contract Period (Months)] / 12`.
10. `Contract End Date` — Date; Initial value `EOMONTH([Contract Start Date],[Contract Period (Months)]-1)+DAY([Contract Start Date])-1`.
11. `P M Visits (TOTAL)` — Number; Initial value `[Contract Period (Months)] / 6`.
12. `Contract Period (Months)` — Number.
13. `Status` — Text; read-only; hidden; spreadsheet formula returns values including `ABOUT TO EXPIRE`, `ACTIVE`, `INACTIVE` based on date logic.
14. `Prev MC Number` — Text.
15. `Products` — List / Ref; App formula `REF_ROWS("ContractDetails","MC Number")`.

---

## 3.7 `WarrantySale_Schema`

Visible columns:

1. `_RowNumber` — Number; read-only; hidden; key = Yes.
2. `SA Number` — Text; Initial value `CONCATENATE("SA",[_RowNumber]+1183)`; key = Yes.
3. `Timestamp` — DateTime; Initial value `NOW()`.
4. `Party Name` — Enum.
5. `Sold Through` — Text; Initial value contains a `LOOKUP` against `PartyMaster` and emits `CUSTOMER` for a matching condition.
6. `INVOICE NO` — Text.
7. `INVOICE DATE` — Date.
8. `Warranty Start Date` — Date; Initial value `TODAY()`.
9. `Warranty Period (in Years)` — Decimal; App formula `[Warranty Period (in Months)] / 12`; Initial value also shown as that expression.
10. `Warranty End Date` — Date; Initial value `EOMONTH([Warranty Start Date],[Warranty Period (in Months)]-1)+DAY([Warranty Start Date])-1`.
11. `PM VISITS` — Number; Initial value `([Warranty Period (in Months)] / 12) * 3`.
12. `Other Details` — Text.
13. `Warranty Period (in Months)` — Number.
14. `WARRANTY STATUS` — Text; spreadsheet formula returns values including `ABOUT TO EXPIRE`, `ACTIVE`, `INACTIVE` based on date logic.
15. `Type` — Number.
16. `Profile` — Number; read-only; hidden.
17. `COUNTRY` — Number; read-only; hidden.
18. `State` — Number; read-only; hidden.
19. `City` — Number; read-only; hidden.
20. `Service Engineer - Initial` — Number; read-only; hidden.
21. `Address` — Number; read-only; hidden.
22. `Inst. Pincode` — Number; read-only; hidden.
23. `Tel 1` — Number; read-only; hidden.
24. `Tel 2` — Number; read-only; hidden.
25. `PAN` — Number; read-only; hidden.
26. `GST` — Number; read-only; hidden.
27. `TAX` — Number; read-only; hidden.
28. `Products` — List / Ref; App formula `REF_ROWS("WarrantySaleDetails","SA Number")`.
29. `Installation Calls` — List / Ref; App formula `FILTER("INSTCalls",[Warranty Number]=[SA Number])`.
30. `Related WarrantySaleDetails` — List / Ref; description says WarrantySaleDetails entries reference this entry in the PM VISITS column; App formula `REF_ROWS("WarrantySaleDetails","PM VISITS")`.
31. `Related WarrantySaleDetails By SA Number` — List / Ref; description says WarrantySaleDetails entries reference this entry in the SA Number column; App formula `REF_ROWS("WarrantySaleDetails","SA Number")`.

---

## 3.8 `WarrantySaleDetails_Schema`

Visible columns:

1. `_RowNumber` — Number; read-only; hidden; key = Yes.
2. `Priority` — Number; read-only; hidden; spreadsheet formula auto-sequences populated rows.
3. `Item Details Long` — Text; Initial value `CONCATENATE([Product Code],"|",[Product Name],"|",[Product Serial Number])`.
4. `Item Details` — Text; read-only; hidden; spreadsheet formula concatenates source values.
5. `SA Number` — Ref to `WarrantySale`.
6. `Sale Entry Date` — DateTime; Initial value `NOW()`.
7. `Party Name` — Enum; App formula looks up `Party Name` from `WarrantySale` by `SA Number`.
8. `Sold Through` — Text; App formula looks up `Sold Through` from `WarrantySale` by `SA Number`.
9. `INVOICE NO` — Text; App formula looks up `INVOICE NO` from `WarrantySale` by `SA Number`.
10. `INVOICE DATE` — Date; App formula looks up `INVOICE DATE` from `WarrantySale` by `SA Number`; Initial value `TODAY()`.
11. `Product Name` — Enum; valid-if references `ProductList[Product Name]`.
12. `Product Code` — Text; valid-if references `ProductList[Product Code]`.
13. `Product Serial Number` — Text.
14. `Warranty Start Date` — Date; App formula looks up `Warranty Start Date` from `WarrantySale` by `SA Number`.
15. `Warranty Period (in Years)` — Decimal; App formula looks up `Warranty Period (in Years)` from `WarrantySale`.
16. `Warranty End Date` — Date; App formula looks up `Warranty End Date` from `WarrantySale`.
17. `PM VISITS` — Number; App formula looks up `PM VISITS` from `WarrantySale`.
18. `ACCESSORIES INCLUDED?` — Yes/No.
19. `CONSUMABLE INCLUDED?` — Yes/No.
20. `CONTRACT PRICE FIXED?` — Text.
21. `Other Details` — Text; Initial value looks up `Other Details` from `WarrantySale`.
22. `Already Sold TO` — Text; Initial value looks up `Party Name` from `Product Master` using `Item Details Long`.
23. `WARRANTY STATUS` — Text; read-only; hidden; spreadsheet formula emits values including `ABOUT TO EXPIRE`, `ACTIVE`, `INACTIVE`.
24. `Warranty Period (in Months)` — Number; App formula looks up `Warranty Period (in Months)` from `WarrantySale`.
25. `Replacement UNIT?` — Yes/No; Initial value `No`.
26. `Replacement Unit SL NO` — Text; description `Old Unit Serial No`; valid-if references `Product Master[Item Details]` when Replacement UNIT? is `Yes`.
27. `Added By` — Email; Initial value `USEREMAIL()`; hidden.
28. `STATE` — Text; read-only; hidden; spreadsheet formula uses `VLOOKUP` against PartyMaster.
29. `CITY` — Text; read-only; hidden; spreadsheet formula uses `VLOOKUP` against PartyMaster.
30. `ENGINEER` — Text; read-only; spreadsheet formula uses `VLOOKUP` against PartyMaster.
31. `Add Call` — URL; read-only; hidden; spreadsheet formula conditionally emits `WI` / `RWI` style values.
32. `INST Call` — Enum; read-only; hidden; enum values shown include entries such as `TO Check`, `17X08016`, `18G23025`, `21L22024`, `19C29066`; spreadsheet formula uses `ArrayFormula`, `IF`, `IFERROR`, `VLOOKUP`, and `INSTDetails-OLD Call`.
33. `LINK` — Text; App formula conditionally uses lookup to Product-Accessory and returns text including `Concatenate Main Prod`, `Add`, `Linked`.

---

## 3.9 `ProductList_Schema`

Visible columns:

1. `_RowNumber` — Number; read-only; hidden.
2. `Added On` — Number.
3. `Added By` — Text.
4. `Item Code | Item Name` — Name; read-only; spreadsheet formula concatenates item code and item name with `|`.
5. `Product Name` — Name.
6. `Product Code` — Text; key = Yes.
7. `Item Type` — Text.
8. `Item Category` — Text.
9. `ACTIVE?` — Enum; visible enum values `Inactive`, `Active`.
10. `Short Form` — Text.

---

## 3.10 `INSTCalls_Schema`

Visible columns:

1. `_RowNumber` — Number; read-only; hidden.
2. `UC Number` — Text; spreadsheet formula shown as an auto-generated identifier using year/month/date components and a running numeric portion.
3. `Call Number` — Text; Initial value `CONCATENATE("I-",[Product Name],"-",[Product Serial Number])`; key = Yes.
4. `Timestamp` — DateTime; Initial value `NOW()`.
5. `Complaint Date` — Date; read-only; hidden.
6. `Party Name` — Name.
7. `City` — Text; Initial value `LOOKUP([_THISROW].[Party Name],PartyMaster,Party Name,City)`.
8. `State` — Text; Initial value `LOOKUP([_THISROW].[Party Name],PartyMaster,Party Name,State)`.
9. `Product Name` — Name.
10. `Product Serial Number` — Text.
11. `Item Status` — Text.
12. `Warranty Number` — Text.
13. `Warranty Start Date` — Date.
14. `Warranty End Date` — Date.
15. `Contract Number` — Text; read-only; hidden.
16. `Contract Start Date` — Date; read-only; hidden.
17. `Contract End Date` — Date; read-only; hidden.
18. `Contract Type` — Text; read-only; hidden.
19. `Call Type` — Text; Initial value `INSTALLATION CALL`.
20. `Standard Complaint` — Text; read-only; hidden; Initial value `Installation Call`.
21. `Complaint Reported` — Text; Initial value `INSTALLATION CALL`.
22. `Call Allocated To` — Text; Initial value looks up `Service Engineer` from `PartyMaster` by `Party Name`.
23. `Breakdown Date` — DateTime; read-only; hidden; Initial value `TODAY()`.
24. `Person Calling` — Text; Initial value `AUTO GENERATION`.
25. `Public Health Threat?` — Enum; visible values `NO`, `YES`; Initial value `NO`.
26. `Death?` — Enum; visible values `NO`, `YES`; Initial value `NO`.
27. `Serious Incident?` — Enum; visible values `NO`, `YES`; Initial value `NO`.
28. `Mode of Complaint Reporting` — Text; read-only; hidden.
29. `Customer Name` — Name; read-only; hidden.
30. `Customer Number` — Number; read-only; hidden.
31. `Customer Designation` — Text; read-only; hidden; spreadsheet formula uses `VLOOKUP` against PendingCalls.
32. `Email address` — Email; read-only; hidden; Initial value shown as `valarmathi.m@airliquide.com`.
33. `PO No.` — Text.
34. `PO Date` — Date; Initial value `TODAY()`.
35. `Call Status` — Text; spreadsheet formula uses `IF`, `IFERROR`, `VLOOKUP`, `CancelCall`, `ReportingSort` and returns `Unsolved` when conditions do not resolve to a solved/cancelled state.
36. `Visit Date & Time` — Date; display name `Call Solved Date`; read-only; spreadsheet formula uses `IF`, `VLOOKUP`, `ReportingSort`, and `Solved - Report Completed` logic.
37. `Visiting Service Engineer` — Text; read-only; spreadsheet formula uses `IF`, `VLOOKUP`, and `ReportingSort`.
38. `Service Report` — File; read-only; spreadsheet formula uses `IF`, `VLOOKUP`, and `ReportingSort`.
39. `Warranty Start Date?` — Text; read-only; spreadsheet formula uses `IF`, `VLOOKUP`, and `ReportingSort`.
40. `Name` — Name; read-only; spreadsheet formula uses `IF`, `VLOOKUP`, and `ReportingSort`.
41. `Contact Number` — Number; read-only; spreadsheet formula uses `IF`, `VLOOKUP`, and `ReportingSort`.
42. `Designation` — Text; read-only; spreadsheet formula uses `IF`, `VLOOKUP`, and `ReportingSort`.
43. `Visit Entry Date` — DateTime; read-only; spreadsheet formula uses `IF`, `VLOOKUP`, and `ReportingSort`.
44. `Add to Product Database` — Text; read-only; hidden; App formula `IF(ISBLANK(LOOKUP([_thisrow].[UC Number],InstallationDetails,"UC Number","Call Number")),"Add","Update")`.

---

## 3.11 `Product Master_Schema`

The PDF reaches this schema on pages 148–150 and ends while the fourth column is being introduced.

Visible columns before the PDF ends:

1. `_RowNumber` — Number; read-only; hidden; key = Yes.
2. `Open Call` — Text; read-only; hidden; spreadsheet formula uses `ArrayFormula`, `IF`, `IFERROR`, `VLOOKUP`, and `OpenCall`.
3. `Item Details Long` — Text; read-only; spreadsheet formula `"COMPUTED_VALUE"`.
4. `Item Details` — Text; the heading and beginning of the column definition are visible on page 150, but the PDF ends before the full definition is shown.

---

# 4. Page-by-page coverage log

This section records what was present on every page so that the review scope is explicit.

| Page | Content observed |
|---:|---|
| 1 | App documentation cover, summary counts, app properties |
| 2 | Table definitions: `_Per User Settings`, `EngineerList`, start of `SPARES` |
| 3 | `SPARES`, `0.ProductSearch`, start of `ContractDetails` |
| 4 | `ContractDetails`, `ContractEntry`, start of `WarrantySale` |
| 5 | `WarrantySale`, `WarrantySaleDetails`, `ProductList` |
| 6 | `INSTCalls`, `Product Master` |
| 7 | `PartyMaster`, `OwnershipTransfer`, start of `10ENGGREQ` |
| 8 | `10ENGGREQ`, `PartyList`, start of `SolvedInstCall` |
| 9 | `SolvedInstCall`, `31 OR Register`, start of `34AdminApproval` |
| 10 | `34AdminApproval`, `2023-CRNRequest`, `Reports` |
| 11 | `InstallationDetails`, `Product-Accessory` |
| 12 | `City List`, `INST` |
| 13 | Start columns; `_Per User Settings_Schema`; `_RowNumber`, `_EMAIL` |
| 14 | `_EMAIL`, `_NAME` |
| 15 | `_LOCATION`, `Options Heading` |
| 16 | `Option 1`, start `Option 2` |
| 17 | `Option 2`, `Country Option` |
| 18 | `Language Option` |
| 19 | `Option 5`, `Option 6` |
| 20 | `Option 7`, `Option 8` |
| 21 | `Option 8`, `Option 9` |
| 22 | `_THISUSER`; start `EngineerList_Schema` |
| 23 | EngineerList `_RowNumber`, `User Name` |
| 24 | `MAIL ID`, `REGION` |
| 25 | `REGION`, `RGM as per WINMAX` |
| 26 | `User Name_5`, `AL Mail ID` |
| 27 | `AL Mail ID`, `RM EMAIL ID` |
| 28 | `Regional Manager`; start `SPARES_Schema` |
| 29 | SPARES `_RowNumber`, `Item Details` |
| 30 | `S. No.`, `PRODUCT` |
| 31 | `Item Code` |
| 32 | `Item Name`, `Active/Inactive?` |
| 33 | `Spare / Consumable`, `Purchase Cost` |
| 34 | `Purchase Cost`, `Purchase Cost (F)` |
| 35 | `Added On`, `Added By` |
| 36 | `Added By`, `Modified On` |
| 37 | `Set to Inactive On`; start `0.ProductSearch_Schema` |
| 38 | ProductSearch `_RowNumber`, `Timestamp` |
| 39 | `Product Name`, `Product Serial No` |
| 40 | `Email Address`; start `ContractDetails_Schema` |
| 41 | ContractDetails `_RowNumber`, `UID` |
| 42 | `UID`, `Priority`, start `Item Details Long` |
| 43 | `Item Details Long`, `Item Details` |
| 44 | `MC Number`, `Contract Entry Date` |
| 45 | `Contract Entry Date`, `Party Name` |
| 46 | `Payment Schedule`, start `Bill Generate At` |
| 47 | `Bill Generate At`, `Contract Type` |
| 48 | `Contract Start Date`, `Contract Period (Years)` |
| 49 | `Contract Period (Years)`, `Contract End Date` |
| 50 | `Contract End Date`, `P M Visits (TOTAL)`, start `Product Details` |
| 51 | `Product Details`, `Product Code` |
| 52 | `Product Name`, `Product Serial Number` |
| 53 | `Product Serial Number`, `Rate` |
| 54 | `Item Tax Amount`, `Total After Tax` |
| 55 | `Total After Tax`, `Contract Period (Months)`, start `Status` |
| 56 | `Status`, `Present Item Status` |
| 57 | `Present Item Status`, `Last Contract Number`, start `Last Contract End Date` |
| 58 | `Last Contract End Date`, `SA Number` |
| 59 | `SA Number`, `SA End Date`, start `Added By` |
| 60 | `Added By`, `LINK` |
| 61 | End prior field; start `ContractEntry_Schema`; `_RowNumber`, start `MC Number` |
| 62 | `MC Number`, `Contract Entry Date` |
| 63 | `Party Name`, `Payment Schedule` |
| 64 | `Payment Schedule`, `Bill Generate At` |
| 65 | `Contract Type`, start `Contract Start Date` |
| 66 | `Contract Start Date`, `Contract Period (Years)` |
| 67 | `Contract Period (Years)`, `Contract End Date`, start `P M Visits (TOTAL)` |
| 68 | `P M Visits (TOTAL)`, `Contract Period (Months)` |
| 69 | `Contract Period (Months)`, `Status`, start `Prev MC Number` |
| 70 | `Prev MC Number`, `Products` |
| 71 | End Products; start `WarrantySale_Schema`; `_RowNumber` |
| 72 | `SA Number`, `Timestamp` |
| 73 | `Timestamp`, `Party Name` |
| 74 | `Sold Through`, `INVOICE NO` |
| 75 | `INVOICE NO`, `INVOICE DATE`, start `Warranty Start Date` |
| 76 | `Warranty Start Date`, `Warranty Period (in Years)` |
| 77 | `Warranty Period (in Years)`, `Warranty End Date`, start `PM VISITS` |
| 78 | `PM VISITS`, `Other Details` |
| 79 | `Warranty Period (in Months)`, `WARRANTY STATUS` |
| 80 | `WARRANTY STATUS`, `Type` |
| 81 | `Profile`, `COUNTRY` |
| 82 | `COUNTRY`, `State`, start `City` |
| 83 | `City`, `Service Engineer - Initial` |
| 84 | `Address`, `Inst. Pincode` |
| 85 | `Inst. Pincode`, `Tel 1`, start `Tel 2` |
| 86 | `Tel 2`, `PAN` |
| 87 | `PAN`, `GST`, start `TAX` |
| 88 | `TAX`, `Products` |
| 89 | `Products`, `Installation Calls` |
| 90 | `Related WarrantySaleDetails` |
| 91 | `Related WarrantySaleDetails By SA Number` |
| 92 | Start `WarrantySaleDetails_Schema`; `_RowNumber`, `Priority` |
| 93 | `Priority`, `Item Details Long` |
| 94 | `Item Details`, `SA Number` |
| 95 | `SA Number`, `Sale Entry Date` |
| 96 | `Party Name`, start `Sold Through` |
| 97 | `Sold Through`, `INVOICE NO` |
| 98 | `INVOICE DATE`, `Product Name` |
| 99 | `Product Name`, `Product Code` |
| 100 | `Product Code`, `Product Serial Number`, start `Warranty Start Date` |
| 101 | `Warranty Start Date`, `Warranty Period (in Years)` |
| 102 | `Warranty End Date`, `PM VISITS` |
| 103 | `PM VISITS`, `ACCESSORIES INCLUDED?` |
| 104 | `CONSUMABLE INCLUDED?`, `CONTRACT PRICE FIXED?` |
| 105 | `CONTRACT PRICE FIXED?`, `Other Details`, start `Already Sold TO` |
| 106 | `Already Sold TO`, `WARRANTY STATUS` |
| 107 | `WARRANTY STATUS`, `Warranty Period (in Months)`, start `Replacement UNIT?` |
| 108 | `Replacement UNIT?`, `Replacement Unit SL NO` |
| 109 | `Replacement Unit SL NO`, `Added By`, start `STATE` |
| 110 | `STATE`, `CITY` |
| 111 | `ENGINEER`, `Add Call` |
| 112 | `Add Call`, `INST Call` |
| 113 | `LINK`; start `ProductList_Schema` |
| 114 | ProductList `_RowNumber`, `Added On` |
| 115 | `Added On`, `Added By`, start `Item Code | Item Name` |
| 116 | `Item Code | Item Name`, `Product Name` |
| 117 | `Product Name`, `Product Code`, `Item Type` |
| 118 | `Item Type`, `Item Category`, start `ACTIVE?` |
| 119 | `ACTIVE?`, `Short Form` |
| 120 | End Short Form; start `INSTCalls_Schema`; `_RowNumber` |
| 121 | `UC Number`, `Call Number` |
| 122 | `Call Number`, `Timestamp` |
| 123 | `Complaint Date`, `Party Name` |
| 124 | `Party Name`, `City`, `State` |
| 125 | `State`, `Product Name` |
| 126 | `Product Serial Number`, `Item Status` |
| 127 | `Item Status`, `Warranty Number`, `Warranty Start Date` |
| 128 | `Warranty Start Date`, `Warranty End Date` |
| 129 | `Contract Number`, `Contract Start Date` |
| 130 | `Contract Start Date`, `Contract End Date`, start `Contract Type` |
| 131 | `Contract Type`, `Call Type` |
| 132 | `Call Type`, `Standard Complaint`, start `Complaint Reported` |
| 133 | `Complaint Reported`, `Call Allocated To` |
| 134 | `Call Allocated To`, `Breakdown Date`, start `Person Calling` |
| 135 | `Person Calling`, `Public Health Threat?` |
| 136 | `Death?`, start `Serious Incident?` |
| 137 | `Serious Incident?`, `Mode of Complaint Reporting` |
| 138 | `Mode of Complaint Reporting`, `Customer Name`, start `Customer Number` |
| 139 | `Customer Number`, `Customer Designation` |
| 140 | `Customer Designation`, `Email address`, start `PO No.` |
| 141 | `PO No.`, `PO Date`, start `Call Status` |
| 142 | `Call Status`, `Visit Date & Time` |
| 143 | `Visit Date & Time`, `Visiting Service Engineer` |
| 144 | `Service Report`, `Warranty Start Date?` |
| 145 | `Warranty Start Date?`, `Name` |
| 146 | `Contact Number`, `Designation` |
| 147 | `Designation`, `Visit Entry Date` |
| 148 | `Add to Product Database`; start `Product Master_Schema`; `_RowNumber` |
| 149 | Product Master `_RowNumber`, `Open Call` |
| 150 | `Open Call`, `Item Details Long`, start `Item Details`; PDF ends |

---

# 5. Source-boundary notes

- The PDF itself states that the app has **24 tables, 587 columns, 5 slices, 65 views, 9 format rules, 98 actions, and 0 workflow rules**.
- The supplied 150-page PDF does **not** show detailed definitions for all 587 columns before it ends. The detailed schema section visible in this file reaches `Product Master_Schema`, Column 4 (`Item Details`) on page 150 and then stops.
- Therefore, this Markdown file does **not** fabricate definitions for columns, slices, views, format rules, actions, or any later sections that are not actually visible in the supplied PDF.
- Repetitive AppSheet metadata such as `Visible?`, `Read-Only`, `Hidden`, `Label`, `Formula version`, `Reset on edit?`, `System Defined?`, `Key`, `Part of Key?`, `Fixed definition?`, `Editable Initial Value?`, `Virtual?`, `LocaleName`, `Searchable`, `Scannable`, and `Sensitive data` is present throughout the PDF. This review records those values where they materially identify a field or where the PDF shows a notable setting; it does not infer omitted values.

