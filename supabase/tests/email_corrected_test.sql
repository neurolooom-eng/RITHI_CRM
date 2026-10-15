-- ===========================================================================
-- AN EMAIL ADDRESS CORRECTED EVERYWHERE (0444). The old address in the login,
-- the profile, a FROZEN call request, a visit's data, a notification and the
-- audit trail -> every one carries the new address; the correction is itself
-- recorded; the triggers are all back on; a re-run changes nothing.
-- Run ONCE after _stub.sql + every migration. Every error printed is labelled
-- `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values ('0e444000-0000-0000-0000-000000000001', 'HarshaVardhan.Singh@airliquide.com') on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0e444000-0000-0000-0000-000000000001', 'harshavardhan.singh@airliquide.com', 'HARSH VARDHAN SINGH RAJPUT', 'rgm')
on conflict (id) do update set email = excluded.email;

alter table public.call_requests disable trigger user;
insert into public.call_requests (reqid, submitted_at, email, call_type, party_name, product, serial_no, status)
  values ('EM-REQ-1', now(), 'harshavardhan.singh@airliquide.com', 'FIELD', 'P', 'VEGA', 'S1', 'Registered');
alter table public.call_requests enable trigger user;
alter table public.reports disable trigger user;
insert into public.reports (uid, ucn, call_status, data, engineer_email, visit_at, updated_at)
  values ('EM-V1', 'EM-1', 'Unsolved', '{"E-Mail": "harshavardhan.singh@airliquide.com", "x": 1}'::jsonb,
          'harshavardhan.singh@airliquide.com', now(), now());
alter table public.reports enable trigger user;
insert into public.record_audit (table_name, op, actor_email, new_data)
  values ('reports', 'UPDATE', 'harshavardhan.singh@airliquide.com', '{"engineer_email": "harshavardhan.singh@airliquide.com"}');

\ir ../migrations/0444_email_harshvardhan_corrected.sql

select 'the login carries the new address' as t,
  exists (select 1 from auth.users where id = '0e444000-0000-0000-0000-000000000001' and email = 'harshvardhan.singh@airliquide.com') as ok;
select 'the profile too' as t,
  (select email from public.profiles where id = '0e444000-0000-0000-0000-000000000001') = 'harshvardhan.singh@airliquide.com' as ok;
select 'a FROZEN call request is corrected' as t,
  (select email from public.call_requests where reqid = 'EM-REQ-1') = 'harshvardhan.singh@airliquide.com' as ok;
select 'a visit''s data and engineer email are corrected, the rest of its data untouched' as t,
  (select data->>'E-Mail' = 'harshvardhan.singh@airliquide.com' and (data->>'x')::int = 1 and engineer_email = 'harshvardhan.singh@airliquide.com'
     from public.reports where uid = 'EM-V1') as ok;
select 'the audit trail is corrected' as t,
  not exists (select 1 from public.record_audit where lower(coalesce(actor_email, '') || coalesce(new_data::text, '') || coalesce(old_data::text, ''))
              like '%harshavardhan.singh@airliquide.com%' and op <> 'BULK UPDATE') as ok;
select 'the correction is recorded, one row per table' as t,
  (select count(*) from public.record_audit where op = 'BULK UPDATE' and new_data->>'note' like 'Email address corrected%'
     and table_name in ('profiles', 'call_requests', 'reports', 'record_audit')) = 4 as ok;
select 'every trigger is back on' as t,
  not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace s on s.oid = c.relnamespace
               where s.nspname = 'public' and not t.tgisinternal and t.tgenabled = 'D'
                 and c.relname in ('profiles', 'call_requests', 'reports', 'record_audit')) as ok;

\echo '--- a frozen request still refuses an ordinary edit (its guard is back) ---'
\echo 'expect ERROR: frozen'
update public.call_requests set party_name = 'Q' where reqid = 'EM-REQ-1';

\echo '--- re-run: nothing more ---'
\ir ../migrations/0444_email_harshvardhan_corrected.sql
select 'the correction''s own record still names the old address' as t,
  exists (select 1 from public.record_audit where op = 'BULK UPDATE' and old_data->>'email' = 'harshavardhan.singh@airliquide.com') as ok;
select 'a re-run records nothing more' as t,
  (select count(*) from public.record_audit where op = 'BULK UPDATE' and new_data->>'note' like 'Email address corrected%') = 4 as ok;
