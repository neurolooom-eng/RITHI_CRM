-- ===========================================================================
-- THE KPI EXPORT READS ONCE (0471, D-180): the same answers as the per-call
-- lookups it replaced.
--
--   0471 swaps call_first_spare_on() per call for call_first_spare_dates()
--   once, and three LATERAL reads of `reports` for one. Every call's Call
--   Attended On, Call Solved Date, Call Status, pending reason and engineer
--   must equal what the old per-call lookups give -- including a call with no
--   visit, a visit with no date, a call solved and then re-opened, two entries
--   at the same moment (the id breaks the tie), and a spare raised by another
--   engineer before the first visit. Checked as an administrator and as the
--   engineer the calls are allotted to.
--   call_first_spare_dates() answers only for calls the caller may see, and
--   the public key may not call it.
--
-- Run ONCE after _stub.sql + every migration. Every error printed is labelled
-- `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off
set timezone = 'UTC';

insert into auth.users (id, email) values
  ('0e471000-0000-0000-0000-000000000001', 'ko_admin@x.com'),
  ('0e471000-0000-0000-0000-000000000002', 'ko_eng@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0e471000-0000-0000-0000-000000000001', 'ko_admin@x.com', 'KO Admin', 'admin'),
  ('0e471000-0000-0000-0000-000000000002', 'ko_eng@x.com',   'KO Eng',   'engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

delete from public.user_directory where email in ('ko_eng@x.com', 'ko_other@x.com');
insert into public.user_directory (name, email, reporting_manager) values
  ('KO Eng', 'ko_eng@x.com', ''), ('KO Other', 'ko_other@x.com', '');

alter table public.field_calls disable trigger user;
alter table public.reports disable trigger user;
alter table public.spare_requests disable trigger user;
insert into public.field_calls (ucn, call_number, call_type, reg_date, reg_at, complaint_date, product_name, serial, party_name, allocated_to) values
  ('KO-1', 'O1', 'FIELD CALL', date '2025-03-01', timestamptz '2025-03-01 10:00+05:30', date '2025-03-01', 'VEGA', 'S1', 'P', 'KO Eng'),
  ('KO-2', 'O2', 'FIELD CALL', date '2025-03-02', timestamptz '2025-03-02 10:00+05:30', date '2025-03-02', 'VEGA', 'S2', 'P', 'KO Eng'),
  ('KO-3', 'O3', 'FIELD CALL', date '2025-03-03', timestamptz '2025-03-03 10:00+05:30', date '2025-03-03', 'VEGA', 'S3', 'P', 'KO Eng'),
  ('KO-4', 'O4', 'FIELD CALL', date '2025-03-04', timestamptz '2025-03-04 10:00+05:30', date '2025-03-04', 'VEGA', 'S4', 'P', 'KO Other');
-- KO-1: visited twice, solved on the second; the spare (raised by KO Other)
--       came before the first visit.
-- KO-2: solved, then re-opened by a later entry; one visit has no date; two
--       entries share an updated_at, so the id decides the latest.
-- KO-3: never visited, no spare.
-- KO-4: somebody else's call -- the engineer must not see it.
insert into public.reports (uid, ucn, call_number, visit_at, updated_at, call_status, pending_reason, engineer) values
  ('KO-1a', 'KO-1', 'O1', timestamptz '2025-03-05 00:00+05:30', timestamptz '2025-03-05 12:00+05:30', 'Unsolved', 'part awaited', 'KO Eng'),
  ('KO-1b', 'KO-1', 'O1', timestamptz '2025-03-08 00:00+05:30', timestamptz '2025-03-08 12:00+05:30', 'Solved - Report Completed', '', 'KO Eng'),
  ('KO-2a', 'KO-2', 'O2', timestamptz '2025-03-06 00:00+05:30', timestamptz '2025-03-06 12:00+05:30', 'Solved - Report Completed', '', 'KO Eng'),
  ('KO-2b', 'KO-2', 'O2', null,                                  timestamptz '2025-03-09 12:00+05:30', 'Unsolved', 'came back', 'KO Eng'),
  ('KO-2c', 'KO-2', 'O2', timestamptz '2025-03-10 00:00+05:30', timestamptz '2025-03-09 12:00+05:30', 'Unsolved', 'tie, later id', 'KO Other'),
  ('KO-4a', 'KO-4', 'O4', timestamptz '2025-03-07 00:00+05:30', timestamptz '2025-03-07 12:00+05:30', 'Solved - Report Completed', '', 'KO Other');
insert into public.spare_requests (uid, ucn, engineer, req_type, or_req_date, created_at) values
  ('KO-SR1', 'KO-1', 'KO Other', 'Call Based', date '2025-03-03', timestamptz '2025-03-03 09:00+05:30'),
  ('KO-SR4', 'KO-4', 'KO Other', 'Call Based', null,              timestamptz '2025-03-02 23:00+05:30');
alter table public.field_calls enable trigger user;
alter table public.reports enable trigger user;
alter table public.spare_requests enable trigger user;

-- The old per-call answers, written out the way 0450 asked them.
create or replace function pg_temp.mismatches() returns bigint language sql as $$
  select count(*) from public.kpi_field_inst k
   cross join lateral (
     select
       (select rl.call_status from public.reports rl where rl.ucn = k."UC Number" order by rl.updated_at desc, rl.id desc limit 1) as status,
       (select rl.pending_reason from public.reports rl where rl.ucn = k."UC Number" order by rl.updated_at desc, rl.id desc limit 1) as pending,
       (select rl.engineer from public.reports rl where rl.ucn = k."UC Number" order by rl.updated_at desc, rl.id desc limit 1) as engineer,
       (select (rs.visit_at at time zone 'Asia/Kolkata')::date from public.reports rs
         where rs.ucn = k."UC Number" and rs.call_status ilike 'solved%report%complet%'
         order by rs.updated_at desc, rs.id desc limit 1) as solved,
       least((select (min(rf.visit_at) at time zone 'Asia/Kolkata')::date from public.reports rf
               where rf.ucn = k."UC Number" and rf.visit_at is not null),
             public.call_first_spare_on(k."UC Number")) as attended
   ) o
   where k."UC Number" like 'KO-%'
     and (k."Call Status" is distinct from coalesce(nullif(btrim(o.status), ''), 'Unattended')
       or k."CALL PENDING REASON" is distinct from coalesce(o.pending, '')
       or k."Visiting Service Engineer" is distinct from coalesce(o.engineer, '')
       or k."Call Solved Date & Time" is distinct from o.solved
       or k."Call Attended On" is distinct from o.attended)
$$;

\echo '--- 1. as an administrator: every call answers as the per-call lookups did ---'
\echo 'expect: 4 calls | 0 mismatches'
call public.be('ko_admin@x.com');
begin; set local role authenticated;
  select (select count(*) from public.kpi_field_inst where "UC Number" like 'KO-%') as calls, pg_temp.mismatches() as mismatches;
rollback;

\echo '--- 2. the cases themselves ---'
\echo 'expect: KO-1 Attended 2025-03-03 (the spare) Solved 2025-03-08 | KO-2 Unsolved "tie, later id" KO Other, Solved 2025-03-06 | KO-3 Unattended, nulls'
begin; set local role authenticated;
  select "UC Number", "Call Attended On", "Call Solved Date & Time", "Call Status", "CALL PENDING REASON", "Visiting Service Engineer"
    from public.kpi_field_inst where "UC Number" in ('KO-1', 'KO-2', 'KO-3') order by 1;
rollback;

\echo '--- 3. as the engineer: their three calls, the same answers, and not KO-4 ---'
\echo 'expect: 3 calls | 0 mismatches | KO-1 still attended 2025-03-03 by the other engineer''s spare'
call public.be('ko_eng@x.com');
begin; set local role authenticated;
  select (select count(*) from public.kpi_field_inst where "UC Number" like 'KO-%') as calls, pg_temp.mismatches() as mismatches,
         (select "Call Attended On" from public.kpi_field_inst where "UC Number" = 'KO-1') as ko1_attended;
rollback;

\echo '--- 4. call_first_spare_dates() answers only for calls the caller may see ---'
\echo 'expect: engineer KO-1 only; administrator KO-1 and KO-4 (KO-4 2025-03-02, India''s day of 23:00 IST)'
begin; set local role authenticated;
  select string_agg(ucn || ' ' || first_on, ', ' order by ucn) as engineer_sees from public.call_first_spare_dates() where ucn like 'KO-%';
rollback;
call public.be('ko_admin@x.com');
begin; set local role authenticated;
  select string_agg(ucn || ' ' || first_on, ', ' order by ucn) as admin_sees from public.call_first_spare_dates() where ucn like 'KO-%';
rollback;

\echo '--- 5. the view reads it once, and no longer per call ---'
\echo 'expect: t | f | t'
select position('call_first_spare_dates' in pg_get_viewdef('public.kpi_field_inst'::regclass)) > 0 as reads_once,
       position('call_first_spare_on' in pg_get_viewdef('public.kpi_field_inst'::regclass)) > 0 as per_call,
       coalesce((select array_to_string(reloptions, ',') like '%security_invoker=on%' from pg_class where oid = 'public.kpi_field_inst'::regclass), false) as invoker;

\echo '--- 6. the public key may not call it ---'
\echo 'expect ERROR: permission denied for function call_first_spare_dates'
begin; set local role anon;
  select count(*) from public.call_first_spare_dates();
rollback;
