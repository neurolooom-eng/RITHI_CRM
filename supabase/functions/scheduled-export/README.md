# Scheduled export — deploy steps

A Supabase Edge Function that mails the tables an administrator chose, as one
ZIP of CSV files, on the days and at the time they chose. What and when are set
on **Administration → Data Export**; **who receives it is a deployment secret
and is not changeable from the application.**

That split is the point, not a limitation. An earlier design kept the
destination in a settings row, which made the nightly copy of the whole
customer base redirectable by any administrator — it was refused, correctly.
Changing the recipients is a deliberate act by somebody holding the project
keys, through the CLI, which is a different person through a different channel.

## 1. A Resend key

- Sign up at resend.com and create an **API key**.
- For real sending, **verify your domain** and send from an address on it. For a
  first test you can send from `onboarding@resend.dev` to your own address.

## 2. Deploy

```bash
npm i -g supabase
supabase link --project-ref <PROJECT_REF>

supabase secrets set \
  RESEND_API_KEY="re_xxx" \
  EXPORT_FROM="RITHI CRM <alerts@yourdomain.com>" \
  EXPORT_TO="service.almsind@gmail.com, devika.m@airliquide.com" \
  EXPORT_SECRET="$(openssl rand -hex 24)"

# no JWT: the shared secret is what admits the schedule
supabase functions deploy scheduled-export --no-verify-jwt
```

Keep the `EXPORT_SECRET` value — the schedule below needs it.

Optional secrets:

| Secret | Default | What it does |
| --- | --- | --- |
| `EXPORT_MAX_MB` | `20` | Attachment cap. Over it, the largest tables are **left out and named in the mail** — never truncated. |
| `EXPORT_MAX_RAW_MB` | `120` | The job refuses to even build a set of CSVs larger than this, rather than running out of memory with nothing to show. |

## 3. Run the database side

Run `supabase/apply/call_requests.sql` (it carries `0227` and `0228`) — that
creates `export_schedules`, `export_runs`, `due_export_schedules()` and grants
the Data Export screen.

## 4. Schedule the poke

Open `schedule_scheduled_export.sql`, replace `<PROJECT_REF>` and
`<EXPORT_SECRET>`, and run it. It fires **every fifteen minutes** and asks the
database whether anything is owed; the times themselves live in
`export_schedules` so they can be changed on the screen without SQL.

## 5. Test

Add a schedule on the screen with a time a minute or two ahead, then either wait
for the tick or force one:

```bash
curl -i -X POST 'https://<PROJECT_REF>.functions.supabase.co/scheduled-export' \
  -H 'x-export-secret: <EXPORT_SECRET>'
```

`{"ok":true,"due":1,...}` means it found one and sent it. `403` is a wrong or
missing secret. `{"due":0}` means nothing was owed — check the schedule's time
and that `last_run_at` is older than it:

```sql
select * from public.due_export_schedules();
select id, label, enabled, frequency, hour_ist, minute_ist, last_run_at, last_status, last_detail
  from public.export_schedules order by id;
select * from public.export_runs order by started_at desc limit 10;
```

## What is tested, and what is not

- **When a schedule is due** is SQL (`export_run_due_at`), and
  `supabase/tests/export_schedule_test.sql` covers the day boundary, the weekly
  wrap and the catch-up.
- **The archive and the cell shaping** are `zip.ts` and `shape.ts`, and
  `npm run check:scheduled-export` builds real archives and has `unzip` read
  them back, and holds `shape.ts` against the browser's own formatter.
- **The function itself is not tested here** and cannot be: it is Deno on
  Supabase holding the service role and talking to Resend. Everything that
  could be moved out of it has been; what is left is reading rows, building a
  file and handing it over.
