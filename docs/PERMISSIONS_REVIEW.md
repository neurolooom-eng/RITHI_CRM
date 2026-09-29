# Actions vs Roles & Permissions — review

2026-09-30. Read-only review of every screen. **Nothing was changed in the app
or the database.** Asked by the user:

> The Actions listed in every view should be part of the Roles and
> Permissions. I don't think that is present. Review / Deep Dive and come back.

## The short answer

**You are right, though the problem is narrower than "not present".**

- Every **permission key** the code checks does exist, and every one appears
  somewhere on Roles & Permissions. Nothing checks a key the matrix has
  never heard of.
- Almost every action that **writes** data is refused by the **database**
  unless the role holds the right key. Of 152 row-level policies, the only
  write rules that test no permission are on a person's own rows (their
  signature, notifications, device report, personal charts), plus one:
  anybody signed in may add a Field Solutions article.

The problem is the **matrix**. An administrator reading a page's row cannot
see, and in several cases cannot control, what governs that page's buttons.
There are six kinds of gap, set out below.

How it was done: 60 screens were read in five groups, following the menu.
Every action was listed with the check guarding it (file and line) and
compared with the actions shown for that page in `PERM_TREE`
(`src/lib/rbac.ts`). The claims that matter most were then re-checked by
hand against the code and a database built from every migration. They are
marked ✔ below. Treat the others as a careful reading, not a test.

**Filed in the findings list** ([`MODULE_REVIEW_LOG.md`](MODULE_REVIEW_LOG.md)) as:

| Finding | Gap below |
|---|---|
| 57 | Gap 1 #1 — Pending Registrations Edit → Save call |
| 58 | Gap 1 #4 — SLA Targets, and the false "saved" |
| 59 | Gap 6 H1 — Indoor Dispatched without the dispatch right |
| 60 | Gap 6 H2 — "Manage users" can grant "Manage roles & permissions" |
| 61 | Gap 6 H3 — anyone can add a Field Solutions article |
| 42, 62 | Gap 2 — downloads that skip `export.data` (42 is Excel; 62 is the rest) |
| 63 | Gap 3 — a row does not show the keys its buttons test |
| 64 | Gap 1 #2, #3, #6 and Gap 3's last rows — screen and database test different keys |
| 65 | Gap 4 — admin only, not grantable |
| 66 | Gap 5 — ticks that do nothing |
| 67 | "One key doing many jobs" |

## How the matrix works — three facts that explain most of it

1. **A key is global, and a row only DISPLAYS it.** `calls.report` is shown
   on the Field Call Register row. Ticking it lets the role report calls on
   the Installation and PM registers too, and those rows show nothing. The
   same tick governs all three screens, but an administrator reading the
   Installation or PM row cannot tell.
2. **`admin` role and super admins pass every check.** Code that tests
   `isAdmin` instead of a key cannot be granted to anybody through the matrix
   at all.
3. **The page key (`mod:<path>`) opens the screen.** Where a button has no
   check of its own, opening the page is the whole right.

---

## Gap 1 — Actions with no permission check on screen

The database is the only guard for these, where there is one.

| # | Screen → action | What it does | Verified |
|---|---|---|---|
| 1 | Pending Registrations → **✎ Edit → Save call** (`PendingRegistrations.tsx:671`, `:405`) | Rewrites any field of a live call. No check, and none of the per-section locks the call registers use. Only the database's `calls_update` stands behind it. | ✔ |
| 2 | Warranty Register → By machine → **+ Installation call** (`CoverRegister.tsx:1029`) | Creates a call and writes the number back to the machine. If the role holds one of the two keys the database asks for and not the other, the call is made and the write-back fails; the screen warns. | ✔ |
| 3 | Warranty/Contract → **+ Field call**, and Product Database → **+ Install** | Opens a call-creation form without checking `calls.create` / `install.create` (+ Install tests `calls.create`, the wrong key). The database refuses the save. | |
| 4 | Admin Config → **SLA Targets → Save** (`SlaRulesCard.tsx:85`) | No check on screen. The database requires admin or `config.manage`, but `saveSlaRule` looks only for an error, and a refused update is not an error. So **Technical Support, which opens this page by default and holds neither, is told it saved when nothing changed.** | ✔ |
| 5 | Tracker → **Delete / Add / Edit** | Gated by the page key alone (by design: "all who have access should be able to add, edit"). No separate delete right. | |
| 6 | Request Registration → **✎ Correct this request → Save** | No check on screen. The database allows it for `calls.create`, `pending.register` or whoever raised the request, while it is still pending (0232). | |

## Gap 2 — Downloads and printed documents

**Only the CSV path checks `export.data`** (`csvExport`, `format.tsx:158`) ✔.
None of these do:

| Path | Where it is used |
|---|---|
| **Excel** `xlsxDownload` (`xlsx.ts:211`) ✔ and `xlsDownload` (`xls.ts:106`) | Visit Reports, the Consumption / Call / Feedback / Not Consumed / **KPI** reports, Hand Stock Report, Feedback Without a Report, Solved Without a Report, Objective evidence, Product Failure Analysis, Field Failure Insights, the Roles & Permissions matrix export |
| **Word** (FFR R-SER-03, `ffrdoc.ts` → `zip.ts`) ✔ | Field Failure Register, and the `/ffr/…` print page |
| **ZIP** (Data Export) | Whole tables, up to 200,000 rows each. Only the database's admin check stops it. |
| **⭳ Download on a signed service report** (`DocPreview.tsx:110`, a plain link) ✔ | Call drawers on all three registers, Visit Reports, the DCCR review drawer |
| **Print pages** `/dc/…`, `/declaration/…`, `/ffr/…` ✔ | These skip the page check on purpose (`App.tsx:90-103`); only the database decides which rows load |

So a role with export switched off is refused the CSV and gets the same data
from the Excel button beside it. **This is review finding 42, still open.**
Also, `export.data` appears on no page row, only under "Across the system".
It can be switched off for everything at once, but never for one screen.

## Gap 3 — Governed, but by a key shown on a different page's row

The button is checked, but an administrator reading this page's row cannot
see what governs it:

| Screen | Row shows | Buttons actually test |
|---|---|---|
| Installation Calls | `install.create` | every `calls.*` key (edit, allot, report, cancel), `spare.request`, `consumption.reconcile` |
| Preventive (PM) | nothing | the same keys |
| Pending Calls | nothing | `calls.allot` |
| Contract Register | nothing | `cover.edit` (including **Delete entry and all its machines**) |
| Objective | nothing | `config.manage` for every edit, recalculation and delete |
| Product Database 2.0 | `masters.view` | `masters.edit` (Rebuild) |
| Product Failure Analysis | nothing | `config.manage` (share a chart with a role or everyone) |
| Daily Complaint Review | `review.edit` | `ffr.manage` (Raise FFR) |
| Reports (all six rows) | nothing | downloads test `consumption.view`, `calls.view`, `reports.view`, `feedback.view` or `calls.report` |
| Pending Dispatch | `spare.dispatch` | `spare.drop` (Drop) |
| Spare Requests | … | `users.manage` for **Change engineer** (and the database wants admin) |
| Material Returns | `stock.return` | `users.manage` / `spare.dispatch` / `spare.approve_rm` to return **for someone else** |
| Declaration print | — | `spare.dispatch` to save an engineer's address into the User Master |
| Bulk Report Mapping | nothing | `calls.report` (bulk-rewrite visit history) |
| Settings | nothing | `users.manage` for every control |
| Software Validation | `config.manage` | also `users.manage`, which the database does not accept |
| Call Review | `callreview.mark` | Reco and Re-open are shown on it, but the database wants `consumption.reconcile` / `pending.register` or `calls.create` |
| Pending Registrations | `pending.register` | "Create new call" tests `pending.register`/`calls.edit`; the database wants `calls.create`/`install.create` |

## Gap 4 — Admin only, so not grantable to any other role

These check `isAdmin`, or the database checks `is_admin()`. Ticking the page
for another role opens it and nothing works:

- **Bulk Uploads** (all 32 registers), **PM Bulk Upload**, the legacy
  **Data Import** panel
- **Data Export**: export, and create / pause / delete a schedule. The
  screen only asks for the page key; the database wants admin.
- Admin Config: **Call Registration desk**, **Frequent Failure rule**,
  **Audit Mode**. The first two are accepted by the database for
  `config.manage` too, but the screen refuses.
- **User Master → Reset password** (the database wants admin; the screen
  offers it to `users.manage`)
- **Spare Requests → Change engineer** (the database wants admin)
- **Daily Complaint Review → correct a review date**; **Objective → cut-off lock**

## Gap 5 — Ticks that do nothing

- `dashboard.view` (Dashboard row): tested nowhere.
- `reports.view` (Visit Reports row): never tested on that screen. The
  table's read policy asks for `calls.view`.
- `config.manage` (Admin Config row): no control on Admin Config tests it.
- `masters.edit` (Product Master row): the screen is read-only.
- `masters.view` (six rows): no screen tests it; only the database's
  read policies use it.
- **User Access** (`/users`): the route redirects to User Master, so its
  tick opens nothing.

## Gap 6 — Holes in the database rules themselves

These are not matrix display problems. The database allows something the
permission says it should not.

| # | What | Verified |
|---|---|---|
| H1 | **Indoor Service**: a unit can be set to **Dispatched** or **Closed** through the Status picker with only `indoor.work`. The guard checks `indoor.dispatch` only when the dispatch date, reference or dispatcher changes, not the status. It does still require a passed quality check. | ✔ (0158 guard) |
| H2 | **User Master → Access**: a holder of `users.manage` cannot change their own permissions or make anyone Admin. They **can** give another person any other key, including `rbac.manage` and `data.view_all`, and that person can do the same back. By default only Admin holds `users.manage`; whether any other role holds it on the live project is not known from here. | ✔ (profiles policy + `profiles_role_guard`) |
| H3 | **Field Solutions articles** (`kb_articles`): any signed-in user may add one. | ✔ (policy) |

## One key doing many jobs

These cannot be granted separately today, which may or may not matter:

- `users.manage`: create logins, reset passwords, disable logins, delete
  directory rows, assign roles, grant any extra key, clone users, plus
  every Settings control and Change engineer on spares.
- `masters.edit`: KYC verification, part rename (moves every record that
  names it), the bulk Serviceman swap, and all master edits.
- `cover.edit`: includes deleting a whole warranty/contract entry with its
  machines.
- `calls.report`: saving a visit also books spare consumption and customer
  feedback.

---

## Screen by screen

A verdict is the reviewer's, on the question "can an administrator control
this screen's actions from its own row?". **Read-only** means there is
nothing to govern beyond opening the page.

| Group | Fully governed | Partly | Not governed |
|---|---|---|---|
| Overview, Quality, Documents, Knowledge Base | Dashboard*, My Workload*, Product & Party Search, KPI*, Spare Insights*, QMS Documents, Service Manuals, How RITHI Functions* | Machine History, Daily Complaint Review, Field Failure Register, Product Failure Analysis | Objective |
| Service Calls | Field Call Register | Request Registration, Pending Registrations, Installation Calls, Call Review, Customer Feedback | PM Calls, Pending Calls, Visit Reports |
| Spares, Indoor | RM Approval, Spare Consumption, Hand Stock*, Stock Transfer, Indoor Service (but H1) | Spare Requests, Pending Dispatch, Material Returns | Stock Out, Delivery Challan / Declaration print |
| Cover, Masters, Reports | Ownership Transfer, Party Master, Product Master*, User Master, Part Master, All Masters and each list | Warranty / Contract Register, Product Database, Product Database 2.0, Reports | Feedback Without a Report, Hand Stock Report |
| Administration | Roles & Permissions, Audit Log, Device Cache Status*, Version History* | Bulk Report Mapping, Software Validation, Settings | Solved Without a Report, Tracker (by design), User Access (leftover), Bulk Uploads, Data Export, PM Bulk Upload, Admin Config, Data Import, My Profile (own account, by design) |

\* read-only.

**Only the master value lists have genuine per-page, per-action ticks**
(add/edit and delete for each list). They are the model the rest could
follow.

---

## What fixing it involves — decisions for you

None of this is built. Each item needs your answer first.

1. **Make every download obey the export permission** (finding 42). One
   change in the download helpers covers Excel, Word, ZIP and the report
   Download link. *Decide:* keep one system-wide "Export / download", or a
   download tick per page?
2. **Show on each row every key its buttons test.** For example, the
   Installation and PM rows would show the same call keys as Field Calls,
   marked as shared; `check:ui` would then fail when a button tests a key
   its page does not show. *Decide:* is "shared, shown on every row that
   uses it" what you want, or should Installation and PM calls get **keys of
   their own** (e.g. `install.edit`, `pm.edit`)? The second changes who can
   do what on the day it ships, so it needs a migration that copies today's
   grants across.
3. **Replace `isAdmin` with grantable keys** where another role should be
   able to do it: Bulk Uploads, Data Export, the Admin Config settings,
   password reset, Change engineer. *Decide:* which of these should ever be
   anyone's but Admin's?
4. **Close H1–H3.** H1 (Dispatched without the dispatch right) and H2
   (`users.manage` can grant `rbac.manage` to others) look like plain bugs.
   H3 depends on whether anyone should be able to add a Field Solutions
   article.
5. **Fix the "Saved" that is not saved** on SLA Targets (count the rows, as
   the call edits do since finding 48), and gate its screen on
   `config.manage`.
6. **Split the bundled keys** where you want them separate: KYC verification,
   part rename, deleting a cover entry, creating logins versus granting
   access.
7. **Remove the dead ticks** (`dashboard.view`, the `/users` row), or make
   them mean something.
