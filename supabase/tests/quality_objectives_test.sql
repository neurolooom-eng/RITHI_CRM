-- ===========================================================================
-- THE QUALITY & BUSINESS OBJECTIVES REGISTER (0130).
--
-- "I need all these there and let's figure out later what all we can automate."
--
-- What this suite is really holding:
--   * all twelve objectives are present for 2026, in the workbook's order and
--     wording, with the targets as TEXT — "<5%", ">75%", "To Monitor" are what
--     an auditor reads and parsing them would invent precision;
--   * a month that was not measured is NULL, not zero. On a quarterly
--     objective the sheet says "NA", and storing that as 0 would drag a rate
--     average down and claim something different;
--   * re-running the seed does NOT overwrite a figure somebody has typed —
--     the one thing that would make the register untrustworthy;
--   * every row says `source = manual` today, which is what the page reports
--     and what will change one objective at a time as they are automated;
--   * writing needs config.manage; reading does not, because an objective is
--     the company's and not one team's.
--
-- Superuser bypasses RLS, so the scoped checks run as `authenticated`.
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('d1d1d1d1-0000-0000-0000-000000000001','qo_admin@x.com'),
 ('d1d1d1d1-0000-0000-0000-000000000002','qo_eng@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('d1d1d1d1-0000-0000-0000-000000000001','qo_admin@x.com','QO Admin','admin'),
 ('d1d1d1d1-0000-0000-0000-000000000002','qo_eng@x.com','QO Eng','engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

-- The suite EDITS two figures, so it puts them back first: run it twice on one
-- database and the second run must see exactly what the first did.
update public.quality_objectives set m09 = null
 where year = 2026 and sort_order = 1;
update public.quality_objectives set m01 = 0.01
 where year = 2026 and parameter = 'Recent Failure Rate of CPXcare';

\echo '--- 1. all twelve objectives, in the workbook order ---'
\echo 'expect: 12'
select count(*) as objectives from public.quality_objectives where year = 2026;

\echo '--- 2. the targets are the sheet''s own words ---'
\echo 'expect: To Monitor, <5%, <6%, <8%, <10%, <12%, <35%, >75%'
select distinct yearly_target from public.quality_objectives where year = 2026 order by 1;

\echo '--- 3. a QUARTERLY objective has no January figure, and it is NULL ---'
\echo 'expect: 3 Months, m01 blank, m03 filled — "NA" is not zero'
select frequency, m01, m03 from public.quality_objectives
 where year = 2026 and parameter = 'Preventive Maintenance Calls';

\echo '--- 4. August onwards is blank, because the sheet is filled to July ---'
\echo 'expect: 0 rows have an August figure'
select count(*) filter (where m08 is not null) as with_august from public.quality_objectives where year = 2026;

\echo '--- 5. every row is TYPED today ---'
\echo 'expect: manual | 12'
select source, count(*) from public.quality_objectives where year = 2026 group by 1;

\echo '--- 6. RE-RUNNING THE SEED DOES NOT OVERWRITE A TYPED FIGURE ---'
\echo 'expect: 0.99 survives — this is the one that would make it untrustworthy'
update public.quality_objectives set m01 = 0.99
 where year = 2026 and parameter = 'Recent Failure Rate of CPXcare';
insert into public.quality_objectives
  (year, sort_order, process, parameter, yearly_target, current_target, frequency, responsible, m01)
values (2026, 2, 'SERVICE', 'Recent Failure Rate of CPXcare', '<5%', '-', 'Monthly', 'National Service Manager', 0.01)
on conflict (year, lower(btrim(parameter))) do nothing;
select m01 from public.quality_objectives where year = 2026 and parameter = 'Recent Failure Rate of CPXcare';

\echo '--- 7. an ENGINEER may READ the objectives ---'
\echo 'expect: 12 — an objective is the company''s, not one team''s'
call public.be('qo_eng@x.com');
begin;
  set local role authenticated;
  select count(*) as readable from public.quality_objectives where year = 2026;
commit;

\echo '--- 8. ...and may NOT write one ---'
\echo 'expect: UPDATE 0 — no write policy matches, so the row is unreachable'
call public.be('qo_eng@x.com');
begin;
  set local role authenticated;
  update public.quality_objectives set m09 = 0.5 where year = 2026 and sort_order = 1;
commit;
\echo 'expect: still blank'
select m09 from public.quality_objectives where year = 2026 and sort_order = 1;

\echo '--- 9. an ADMIN may, and the row records who and when ---'
\echo 'expect: 0.5, stamped with QO Admin'
call public.be('qo_admin@x.com');
begin;
  set local role authenticated;
  update public.quality_objectives set m09 = 0.5 where year = 2026 and sort_order = 1;
commit;
select o.m09, p.full_name as updated_by, o.updated_at > now() - interval '1 minute' as just_now
  from public.quality_objectives o left join public.profiles p on p.id = o.updated_by
 where o.year = 2026 and o.sort_order = 1;

\echo '--- 10. the page is granted to every role that can see KPI & Failure Analysis ---'
\echo 'expect: no rows — nobody has mod:/kpi without mod:/objective'
select role from public.app_roles
 where permissions ? 'mod:/kpi' and not (permissions ? 'mod:/objective');
