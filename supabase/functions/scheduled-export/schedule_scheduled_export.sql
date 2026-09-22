-- ===========================================================================
-- Poke the scheduled export. Run this in the Supabase SQL editor AFTER the
-- function is deployed and its secrets are set. Replace <PROJECT_REF> and
-- <EXPORT_SECRET> (which must equal the EXPORT_SECRET set on the function).
--
-- EVERY FIFTEEN MINUTES, NOT AT A FIXED HOUR, and that is deliberate. The times
-- people choose live in export_schedules and are changed on a screen; if the
-- cron held the hour, moving a schedule from 23:00 to 06:00 would need somebody
-- with SQL access. So the cron only asks "is anything owed?", and
-- due_export_schedules() answers. It also means a night the function was
-- restarting is caught up at the next tick instead of skipped, and a schedule
-- can never fire twice — the job compares the due instant with last_run_at.
-- ===========================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'scheduled-export',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/scheduled-export',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-export-secret', '<EXPORT_SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);

-- Handy:
--   send anything owed now:  run just the net.http_post(...) statement above.
--   what is owed right now:  select * from public.due_export_schedules();
--   stop it:                 select cron.unschedule('scheduled-export');
--   see schedules:           select * from cron.job;
--   see last runs:           select * from cron.job_run_details order by start_time desc limit 10;
--   see what was sent:       select * from public.export_runs order by started_at desc limit 20;
