-- ===========================================================================
-- Schedule the daily digest. Run in the Supabase SQL editor AFTER the function
-- is deployed and its secrets are set. Replace <PROJECT_REF> and <DIGEST_SECRET>
-- (DIGEST_SECRET must equal the secret you set on the function).
-- ===========================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 03:30 UTC = 09:00 IST. Change the cron expression to move the send time.
select cron.schedule(
  'daily-digest',
  '30 3 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/daily-digest',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-digest-secret', '<DIGEST_SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);

-- Handy:
--   send one now:   run just the net.http_post(...) statement above.
--   change time:    select cron.unschedule('daily-digest');  then re-run this.
--   see schedules:  select * from cron.job;
--   see last runs:  select * from cron.job_run_details order by start_time desc limit 10;
