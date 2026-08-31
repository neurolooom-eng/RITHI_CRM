# Daily digest — deploy steps

A Supabase Edge Function that emails a defined set of people one daily mail with
four sections, each also attached as a CSV:

1. **Open / pending calls** — every call not yet closed (Field / Installation / PM)
2. **PM due soon** — open PM calls due within `DIGEST_PM_DAYS` days (default 7)
3. **Spares awaiting dispatch** — approved spare lines waiting at Stores
4. **Complete call register** — every call, as an archive CSV

It reads with the service role (so it sees everything) and sends via **Resend**.
Nothing secret lives in the repo — you set the keys as function secrets.

## 1. Get a Resend key
- Sign up at resend.com, create an **API key**.
- For real sending, **verify your domain** and use a sender on it
  (e.g. `RITHI CRM <alerts@yourdomain.com>`). For a quick test you can send
  from `onboarding@resend.dev` to your own address.

## 2. Deploy the function
```bash
# once: install the CLI and link the project
npm i -g supabase
supabase link --project-ref <PROJECT_REF>

# set the secrets (never commit these)
supabase secrets set \
  RESEND_API_KEY="re_xxx" \
  DIGEST_FROM="RITHI CRM <alerts@yourdomain.com>" \
  DIGEST_TO="ops@almsind.com, manager@almsind.com" \
  DIGEST_SECRET="$(openssl rand -hex 24)" \
  DIGEST_PM_DAYS="7"

# deploy (no JWT, so the cron can call it with just the secret header)
supabase functions deploy daily-digest --no-verify-jwt
```
Note the `DIGEST_SECRET` value — you need it in the schedule below.

## 3. Schedule it
Open `schedule_daily_digest.sql`, replace `<PROJECT_REF>` and `<DIGEST_SECRET>`,
and run it in the Supabase SQL editor. Default send time is **03:30 UTC (09:00 IST)**.

## 4. Test
Run just the `net.http_post(...)` statement from the schedule file once — you
should get the mail within a few seconds. Or `curl`:
```bash
curl -i -X POST 'https://<PROJECT_REF>.functions.supabase.co/daily-digest' \
  -H 'x-digest-secret: <DIGEST_SECRET>'
```
A `200` with `{"ok":true,...}` means it sent. `403` = wrong/missing secret.

## Changing things later
- **Recipients:** `supabase secrets set DIGEST_TO="a@x.com, b@x.com"` (no redeploy needed).
- **Send time:** `select cron.unschedule('daily-digest');` then re-run the schedule file.
- **PM window:** `supabase secrets set DIGEST_PM_DAYS="10"`.
