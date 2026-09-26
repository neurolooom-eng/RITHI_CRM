-- ===========================================================================
-- AN EDIT THROUGH THE `calls` VIEW REPORTS WHAT IT WROTE (finding 48).
--
-- The view's INSTEAD OF UPDATE trigger routes the edit to field_calls /
-- installation_calls / pm_calls. When row-level security lets the caller SEE
-- a call but not CHANGE it, that inner UPDATE matches no row -- and the trigger
-- used to return NEW regardless, so the caller was told "UPDATE 1" over a call
-- left exactly as it was. It returns NULL now when nothing was written, so the
-- row count (and PostgREST's returned rows) say 0.
--
-- Proved as `authenticated`: a superuser ignores row-level security and would
-- be allowed the write whatever the trigger said.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('48000000-0000-0000-0000-000000000001', 'hon-admin@x.com'),
  ('48000000-0000-0000-0000-000000000002', 'hon-hotline@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('48000000-0000-0000-0000-000000000001', 'hon-admin@x.com',   'Hon Admin',   'admin'),
  ('48000000-0000-0000-0000-000000000002', 'hon-hotline@x.com', 'Hon Hotline', 'hotline')
on conflict do nothing;

create or replace procedure public.be(p_email text) language plpgsql as $$
begin
  update public.harness set uid = (select id from auth.users where email = p_email), email = p_email;
end $$;
grant select on public.harness to anon, authenticated;

-- One call of each kind, so every branch of the trigger is exercised.
insert into public.calls (call_type, product_name, serial, reg_date, party_name,
                          complaint_reported, standard_complaint, allocated_to)
values ('FIELD',        'HONPROD', 'HON-F', current_date, 'HON HOSP', 'before', 'y', ''),
       ('INSTALLATION', 'HONPROD', 'HON-I', current_date, 'HON HOSP', 'before', 'y', ''),
       ('PM',           'HONPROD', 'HON-P', current_date, 'HON HOSP', 'before', 'y', '');

\echo ''
\echo '--- 1. A ROLE THAT MAY SEE A CALL BUT NOT CHANGE IT IS TOLD 0 ---'
call public.be('hon-hotline@x.com');
set role authenticated;
select 'the hotline desk sees every call and may edit none' as check,
       public.can_view_all_calls()::text as sees_all_should_be_true,
       (public.has_perm('calls.edit') or public.has_perm('calls.report') or public.has_perm('calls.allot')
        or public.has_perm('calls.edit.complaint'))::text as may_edit_should_be_false,
       (select count(*) from public.calls where product_name = 'HONPROD')::text as sees_should_be_3;
do $$
declare n bigint;
begin
  update public.calls set complaint_reported = 'changed by hotline' where product_name = 'HONPROD';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'the view reported % row(s) updated where row-level security let nothing through', n;
  end if;
  raise notice 'ok: 0 rows reported, as nothing was written';
end $$;
reset role;
select 'and nothing was written' as check,
       count(*) filter (where complaint_reported = 'before')::text as unchanged_should_be_3
  from public.calls where product_name = 'HONPROD';

\echo ''
\echo '--- 2. A ROLE THAT MAY CHANGE IT IS TOLD WHAT IT CHANGED ---'
call public.be('hon-admin@x.com');
set role authenticated;
do $$
declare n bigint;
begin
  update public.calls set complaint_reported = 'changed by admin' where product_name = 'HONPROD';
  get diagnostics n = row_count;
  if n <> 3 then
    raise exception 'an admin edit of 3 calls (field, installation, PM) reported % row(s)', n;
  end if;
  raise notice 'ok: 3 rows reported and written';
end $$;
reset role;
select 'and all three were written' as check,
       count(*) filter (where complaint_reported = 'changed by admin')::text as changed_should_be_3
  from public.calls where product_name = 'HONPROD';
