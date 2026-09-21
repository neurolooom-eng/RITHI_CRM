-- ===========================================================================
-- IS THE AUDIT TRAIL ON, AND HOW FAR BACK DOES IT GO?
--
-- Read-only. Paste the whole file into the Supabase SQL editor. Row 1 first.
--
-- THERE ARE TWO TRAILS AND THEY ARE NOT INTERCHANGEABLE.
--
--   `audit_log`    written by the CLIENT. It can be bypassed by a direct API
--                  call, and it is PURGED on a retention window.
--   `record_audit` written by the DATABASE -- a before/after image of every
--                  row on the ten quality tables. It cannot be bypassed and
--                  nothing purges it. Switched OFF by 0112 on 2026-09-05;
--                  0225 turns it back on.
--
-- I told you on 2026-09-21 that the "Close call" entries had expired on a
-- SEVEN-DAY retention. That was 0033's figure. 0047 replaced it with
-- `audit_retention_days`, defaulted to 3650 -- ten years. Row 5 says which of
-- those is actually in force on this project, because only the project knows.
-- If it reads 3650, my explanation was wrong and row 7 says what is really
-- there.
-- ===========================================================================
with armed as (
  select c.relname::text as tbl,
         count(*) filter (where t.tgname in ('record_audit_i','record_audit_u','record_audit_d')) as n
    from pg_class c
    left join pg_trigger t on t.tgrelid = c.oid and not t.tgisinternal
   where c.relname in ('field_calls','installation_calls','pm_calls','reports',
                       'spare_requests','spare_request_lines','spare_consumption',
                       'feedback','call_requests','pending_registrations')
     and c.relnamespace = 'public'::regnamespace
   group by c.relname
)
select * from (
  select 1 as n, 'Database-enforced trail (record_audit) is armed on' as question,
         (select count(*) from armed where n = 3)::text || ' of ' || (select count(*) from armed)::text || ' tables' as answer,
         'All of them = on. 0 = still off; run record_audit.sql (it carries 0225).' as what_it_means
  union all
  select 2, '   ...any table only PARTLY armed',
         coalesce((select string_agg(tbl || ' (' || n || '/3)', ', ') from armed where n between 1 and 2), 'none'),
         'Three triggers per table -- insert, update, delete. A partial one audits some writes and not others, which is worse than none because it reads as covered.'
  union all
  select 3, '   ...rows it holds', 
         case when to_regclass('public.record_audit') is null then 'table missing'
              else (select count(*)::text from public.record_audit) end,
         'What it captured before 0112 switched it off, plus anything since it was re-armed. 0049 forbids deleting these.'
  union all
  select 4, '   ...and the newest one',
         case when to_regclass('public.record_audit') is null then 'n/a'
              else coalesce((select to_char(max(changed_at), 'DD-Mon-YYYY HH24:MI') from public.record_audit), 'none') end,
         'A date around 05-Sep-2026 is when it was switched off. Today''s date means it is running now.'
  union all
  select 5, 'Client trail (audit_log) retention',
         coalesce((select value from public.app_settings where key = 'audit_retention_days'), 'not set -- 0047 has not run, so 0033''s 7 days applies'),
         'THE ANSWER TO WHAT I GOT WRONG. 3650 = ten years, and the Close-call entries did NOT expire. 7 = they did.'
  union all
  select 6, '   ...rows it holds',
         (select count(*)::text from public.audit_log),
         null
  union all
  select 7, '   ...oldest and newest',
         coalesce((select to_char(min(at), 'DD-Mon-YYYY') || '  ->  ' || to_char(max(at), 'DD-Mon-YYYY') from public.audit_log), 'empty'),
         'If the oldest is months back, nothing has been purged -- and a missing event was never written rather than deleted.'
  union all
  select 8, '   ...anything recorded for closing a call',
         (select count(*)::text from public.audit_log where action ilike '%close%'),
         'The 4,222 incident turned on whether these existed. This counts them rather than assuming.'
  union all
  select 9, 'Audit mode',
         coalesce((select value from public.app_settings where key = 'audit_mode'), 'not set'),
         'The admin-only switch from 0114. Nothing reads it yet -- it is recorded, not acted on.'
  union all
  -- NAMING cron.job STATICALLY WOULD KILL THIS WHOLE FILE where pg_cron is not
  -- installed -- Postgres parses the query before any row runs, so one missing
  -- relation costs every other answer. The same fault
  -- `_do_i_need_to_reupload.sql` had. `query_to_xml` takes the query as TEXT,
  -- so it is not parsed until the CASE has already decided to run it.
  select 10, 'Purge job (audit_log only)',
         case when to_regclass('cron.job') is null then 'pg_cron is not installed -- nothing is purging audit_log'
              else coalesce((xpath('//text()', query_to_xml(
                     'select schedule from cron.job where jobname = ''purge-audit-log''',
                     false, true, '')))[1]::text, 'not scheduled') end,
         'It purges audit_log only. record_audit is never purged by anything.'
) rows order by n;
