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
- `src/lib/supabase.ts` — client, connection config, and a data API whose
  function shapes mirror the old `sheets.ts` so modules switch mechanically.
- `@supabase/supabase-js` installed.

## Open items to confirm before go-live

- **UCN format**: `next_ucn()` currently emits `<YY><MonthLetter><DD><TypeLetter><Seq4>`
  (e.g. `26H28F0009`). Confirm this exactly matches the legacy sheet format,
  and whether the sequence should reset per day/month.
- **Auth**: Supabase Auth email/password or Google sign-in? (Maps to
  `profiles`; the existing User Master login is replaced.)
- **Credentials**: Supabase Project URL + anon (public) key.
