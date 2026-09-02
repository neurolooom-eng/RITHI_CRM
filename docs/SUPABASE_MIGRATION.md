# RITHI CRM — Google Sheets → Supabase (full cutover)

Why: the Apps Script read path (cold start + full-sheet scan over ~7k rows,
forced onto JSONP) times out. Postgres via Supabase gives an instant,
CORS-native REST API with server-side filtering, Row-Level Security, Auth, and
file storage — the timeouts go away structurally.

## Target architecture

```
React SPA (GitHub Pages)
        │  @supabase/supabase-js (anon key, RLS-enforced)
        ▼
Supabase: Postgres  ← tables + RLS + next_ucn() (see migrations/0001_init.sql)
          Auth      ← login (replaces / maps User Master)
          Storage   ← manual report uploads
          Edge Fns  ← spare-request explosion, approval workflow (phase 3)
```

## Data model (see `supabase/migrations/0001_init.sql`)

| Table | Replaces (sheet) |
|---|---|
| `profiles` | User Master (+ Supabase Auth link) |
| `parties` | Party Master |
| `products` | Product Master |
| `parts` | ITEM Master |
| `masters` | 200_All_Masters value-lists (complaint, call type, pending reason, feedback rating…) |
| `calls` | FIELD + INSTALLATION + PM registers (`call_type` distinguishes) |
| `pending_registrations` | Data-2026 rows without a UCN |
| `reports` | Reporting-N |
| `spare_requests` + `spare_request_lines` | 26_SpareRequest intake + `v2_OR_Req` |
| `spare_consumption` | v2Consumption |
| `feedback` | v2Feedback |

RLS reproduces the app's access rules: engineer sees calls allocated to them;
RM/RGM sees the reporting sub-tree (recursive over
`reporting_manager_email` / `regional_manager_email`); admin sees all.
`next_ucn()` assigns the UCN on insert.

## Cutover phases

1. **Provision** (you): create a Supabase project, run `0001_init.sql`, enable
   Auth, create a Storage bucket `reports`. Paste the Project URL + anon key
   into the app (Settings → Database) — or set `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` at build time.
2. **Migrate data** (one-time script, service_role key, run locally — never
   committed): export each sheet tab → insert into the matching table.
3. **Switch reads** to Supabase (`src/lib/supabase.ts`), screen by screen,
   starting with the timeout-prone ones (Field Calls, Pending, Dashboard,
   Spare Requests, masters).
4. **Switch writes** to Supabase; retire the Apps Script bridge.
5. **Business logic**: port spare-request explosion + approval chain to a
   Postgres trigger / Edge Function (currently sheet formulas).

## What's already in the repo

- `supabase/migrations/0001_init.sql` — schema + RLS + UCN generator.
- `supabase/migrations/0008_rbac_enforcement.sql` — RBAC enforced in Postgres
  (see below).
- `supabase/migrations/0009_spare_receipt.sql` — spare-request receipt stage:
  acknowledgement columns, and the stage guard extended to cover them.
- `supabase/migrations/0011_spare_intake.sql` — spare-request OR number (from
  OR47042), RowNo, OR request date, qty and 20-part limits.
- `supabase/migrations/0012_spare_auto_approval.sql` — lets the RM's approval
  auto-clear Commercial/NSM on non-AMC items, which 0008's guard refused.
- `supabase/tests/` — psql harness for the spare-request triggers (see its
  README); it is what caught the 0011 bug.
- `src/lib/supabase.ts` — client, connection config, and a data API whose
  function shapes mirror the old `sheets.ts` so modules switch mechanically.
- `@supabase/supabase-js` installed.

## RBAC — server-side enforcement (`0008_rbac_enforcement.sql`)

The role → action matrix that admins edit in **Admin → Roles & Permissions**
(`app_roles`) is now enforced by Postgres, not only by the browser. Before
this, `can(action)` hid buttons and blocked routes, but anyone holding the
(public) anon key and any login could write rows the UI would never offer.

How it works:

- `public.has_perm('<action>')` resolves the signed-in user's `profiles.role`
  against `app_roles.permissions` — the same rows the admin matrix edits.
  Admins and super admins hold every action; a role with no row (or an empty
  permission list) falls back to `engineer`, so a half-configured matrix
  degrades to least privilege instead of locking everyone out.
- `public.app_super_admins` holds the dev/support logins that always have full
  rights (mirrors `SUPER_ADMINS` in `src/lib/auth.tsx`). Maintained in SQL —
  there is deliberately no write policy.
- Every RLS policy now names the action it needs: `calls.create` to insert a
  call, `calls.report` to file a report, `masters.edit` to change any master
  (or `master.<list>.edit` / `master.<list>.delete` for one value list alone),
  `spare.request` to raise a spare request, `users.manage` for profiles,
  `rbac.manage` for the matrix itself. Reference data (parties / products /
  parts / value lists) stays readable to any signed-in user — engineers need
  it to fill a call in.
- The reporting-tree scope (`can_see_call`) still applies on top of the
  action, so `calls.view` widens *what kind of* access a role has, never
  *whose* calls it sees.
- Approval stages can't be expressed in RLS (it grants whole rows), so a
  `before update` trigger on `spare_requests` guards them column by column:
  the RM / Commercial / NSM / Stores columns each require their own action,
  and moving `stage` requires at least one of them.
- A trigger on `profiles` blocks self-promotion: nobody edits their own role,
  and granting `admin` requires already being an administrator.

The seeded matrix mirrors `DEFAULT_PERMS` in `src/lib/rbac.ts`; existing rows
with a non-empty permission list are left untouched, so admin edits win.
**Keep the two in sync when actions or roles change.**

Rejections surface in the UI through `errMsg()` in `src/lib/supabase.ts`,
which turns `42501` / row-level-security errors and the triggers' `RBAC: …`
messages into a readable sentence.

## Password reset

Passwords live in Supabase Auth, so resets go through it — the app never sees
or stores another user's password.

Three ways in:

- **Forgot password** on the sign-in screen → `resetPasswordForEmail()` emails a
  one-time link. The form always reports success, so it can't be used to probe
  which addresses have accounts.
- **User Access → Reset password** (admins) sends that same link to a user who
  is locked out.
- **Settings → Password** changes it while signed in; the current password is
  checked first, since `updateUser()` alone doesn't ask for it.

The link returns to the app as an implicit-flow fragment
(`#access_token=…&type=recovery`). The app routes on the hash, so
`takeRecoveryFromUrl()` in `src/lib/supabase.ts` grabs the tokens in
`main.tsx` *before* React and the router run, resets the URL to `#/`, and
`AuthProvider` exchanges them for a session; `ResetPassword.tsx` then takes the
new password. An expired or reused link comes back as `#error=…` and is shown
as a message on the sign-in screen. `detectSessionInUrl` is off so the client
doesn't race that handoff.

**Project setup required for the emails to arrive:**

- Authentication → URL Configuration: set the **Site URL** and add the deployed
  app URL (and any preview URLs) to **Redirect URLs** — the link's `redirectTo`
  must be allow-listed or Supabase refuses it.
- Authentication → Emails: configure SMTP. The built-in sender is rate-limited
  to a handful of messages an hour and is not meant for production.

## Open items to confirm before go-live

- **UCN format**: `next_ucn()` currently emits `<YY><MonthLetter><DD><TypeLetter><Seq4>`
  (e.g. `26H28F0009`). Confirm this exactly matches the legacy sheet format,
  and whether the sequence should reset per day/month.
- **Auth**: Supabase Auth email/password or Google sign-in? (Maps to
  `profiles`; the existing User Master login is replaced.)
- **Credentials**: Supabase Project URL + anon (public) key.
