-- ===========================================================================
-- A CHART SOMEBODY BUILDS, AND KEEPS (0206). Every error printed is labelled
-- `expect ERROR`.
--
-- RUN AS `authenticated`, never as the owner. The table owner bypasses RLS
-- entirely, so a suite run without `set local role authenticated` proves a hole
-- closed while it stands open — the lesson this project already wrote down.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.app_roles (role, label, permissions) values
  ('engineer','Engineer','[]'::jsonb),
  ('configurer','Configurer','["config.manage"]'::jsonb),
  ('admin','Admin','[]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;

insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-000000000001','chart.eng@example.com'),
  ('cccccccc-0000-0000-0000-000000000002','chart.other@example.com'),
  ('cccccccc-0000-0000-0000-000000000003','chart.cfg@example.com')
on conflict (id) do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('cccccccc-0000-0000-0000-000000000001','chart.eng@example.com','AN ENGINEER','engineer'),
  ('cccccccc-0000-0000-0000-000000000002','chart.other@example.com','ANOTHER ENGINEER','engineer'),
  ('cccccccc-0000-0000-0000-000000000003','chart.cfg@example.com','A CONFIGURER','configurer')
on conflict (id) do nothing;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

\echo ''
\echo '=== 1. ANYBODY MAY KEEP A CHART OF THEIR OWN ==========================='
call public.be('chart.eng@example.com');
begin;
  set local role authenticated;
  insert into public.saved_charts (page, name, spec)
  values ('product-failure','My root causes','{"dim":"root_cause_keyword","form":"pareto"}'::jsonb);
commit;
select name, coalesce(role,'(private)') as scope,
       case when owner = 'cccccccc-0000-0000-0000-000000000001' then 'STAMPED AS THEIRS (correct)'
            else 'owner: ' || coalesce(owner::text,'(none)') end as owner
  from public.saved_charts where name = 'My root causes';
\echo '    `owner` is stamped by the database, never sent by the caller.'

\echo ''
\echo '=== 2. ...and nobody else can see it ==================================='
call public.be('chart.other@example.com');
begin;
  set local role authenticated;
  select count(*) as should_be_zero from public.saved_charts where name = 'My root causes';
commit;

\echo ''
\echo '=== 3. a caller-supplied OWNER is DISCARDED, not refused ==============='
-- The first version of this section expected an error, and it was the TEST that
-- was wrong. The stamp trigger runs BEFORE the row-level check and overwrites
-- `owner` with auth.uid(), so the row is filed as the CALLER'S and the check
-- then passes. That is the same shape as 0113 on a call — "a caller-supplied
-- value discarded" — and it is the better behaviour: refusing would make an
-- honest client that sends its own id fail, while discarding makes a dishonest
-- one harmless. What matters is only that the row cannot end up under somebody
-- else's name, and that is what this asserts.
call public.be('chart.other@example.com');
begin;
  set local role authenticated;
  insert into public.saved_charts (page, name, owner, spec)
  values ('product-failure','Not mine','cccccccc-0000-0000-0000-000000000001','{}'::jsonb);
commit;
select case when owner = 'cccccccc-0000-0000-0000-000000000002'
              then 'FILED AS THE CALLER (correct)'
            else 'filed as somebody else: ' || coalesce(owner::text,'(none)') end as owner
  from public.saved_charts where name = 'Not mine';

\echo ''
\echo '=== 4. AN ENGINEER CANNOT SHARE ONE WITH EVERYONE ======================'
-- Sharing decides what a group of people see when they open a screen, which is
-- the same act as setting a register layout for a role (0120) and takes the
-- same authority.
\echo '    expect ERROR: new row violates row-level security policy'
call public.be('chart.eng@example.com');
begin;
  set local role authenticated;
  insert into public.saved_charts (page, name, role, spec)
  values ('product-failure','Everyone sees this','','{}'::jsonb);
commit;

\echo ''
\echo '=== 5. somebody with config.manage CAN ================================='
call public.be('chart.cfg@example.com');
begin;
  set local role authenticated;
  insert into public.saved_charts (page, name, role, spec)
  values ('product-failure','Shared with all','','{"dim":"item_status","form":"share"}'::jsonb);
commit;
select name, case when role = '' then 'EVERYONE (correct)' else 'role: ' || role end as scope
  from public.saved_charts where name = 'Shared with all';

\echo ''
\echo '=== 6. ...and everyone then sees it ===================================='
call public.be('chart.other@example.com');
begin;
  set local role authenticated;
  select count(*) as should_be_one from public.saved_charts where name = 'Shared with all';
commit;

\echo ''
\echo '=== 7. A CHART SHARED WITH A ROLE REACHES THAT ROLE AND NO OTHER ======='
call public.be('chart.cfg@example.com');
begin;
  set local role authenticated;
  insert into public.saved_charts (page, name, role, spec)
  values ('product-failure','Engineers only','engineer','{}'::jsonb);
commit;
call public.be('chart.other@example.com');       -- an engineer
begin;
  set local role authenticated;
  select count(*) as engineer_sees_one from public.saved_charts where name = 'Engineers only';
commit;
call public.be('chart.cfg@example.com');         -- a configurer, not an engineer
begin;
  set local role authenticated;
  select count(*) as configurer_sees_zero from public.saved_charts where name = 'Engineers only';
commit;
\echo '    ...and the person who CREATED it cannot see it either, because it was'
\echo '    shared with a role they are not on. That is the rule working, not a'
\echo '    bug: a shared chart belongs to its audience, not to its author.'

\echo ''
\echo '=== 8. two charts of one name cannot exist on one page ================='
\echo '    expect ERROR: duplicate key value violates unique constraint'
call public.be('chart.eng@example.com');
begin;
  set local role authenticated;
  insert into public.saved_charts (page, name, spec)
  values ('product-failure','My root causes','{}'::jsonb);
commit;

\echo ''
\echo '=== 9. ...but a PRIVATE one and a SHARED one may share a name ========='
-- Two different things: yours, and the one an administrator published. The
-- reader compares `set_at` and the later decision stands (0120s rule).
call public.be('chart.eng@example.com');
begin;
  set local role authenticated;
  insert into public.saved_charts (page, name, spec)
  values ('product-failure','Shared with all','{"dim":"root_cause_keyword"}'::jsonb);
commit;
select count(*) as should_be_two from public.saved_charts where name = 'Shared with all';
