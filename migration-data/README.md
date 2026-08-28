# Migration data (CSV exports)

Drop the Google Sheet tab exports here, then run the migration:

```bash
export SUPABASE_URL="https://xxxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ...service_role..."   # Project Settings → API → service_role. NEVER commit this.
node scripts/migrate.mjs           # loads every CSV present
```

Export each tab as **File → Download → Comma-separated values (.csv)** and name it:

| File | From tab | Key columns the script reads |
|---|---|---|
| `parties.csv` | Party Master | Party Name, City, State, Party Type, Address |
| `products.csv` | Product Master | Party Name, Item Name, Item Serial Number, Item Status, Warranty/Contract dates |
| `parts.csv` | ITEM Master | Item Code, Item Description, Item Details, Active/Inactive? |
| `masters.csv` | value-lists | two columns: `name,value` (one row per option) |
| `field.csv` | FIELD register | UC Number, Call Number, Party/Product/Serial, Call Allocated To, … |
| `installation.csv` | INSTALLATION register | same shape as FIELD |
| `pm.csv` | PM register | same shape as FIELD |
| `pending.csv` | Data-2026 (no UCN) | ENGINEER, CALL TYPE, PARTY NAME, PRODUCT, SERIAL NO, Reported Problem |
| `reporting.csv` | Reporting-N | UC Number, Call Status, Pending Reason, Visiting Service Engineer |

Skip any file you don't have — the script only loads what's present. Column
names are matched leniently; adjust the mappings in `scripts/migrate.mjs` if a
header differs.

**`masters.csv`** is a flat list you assemble by hand or with a formula, e.g.:

```
name,value
standardComplaint,No Power
standardComplaint,Display Error
calltype,Field Call
calltype,Installation
pendingreason,Spare Awaited
feedbackrating,Excellent
feedbackrating,Good
```

The CSVs themselves are git-ignored — they hold live customer data.
