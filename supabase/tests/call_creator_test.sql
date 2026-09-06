-- ===========================================================================
-- Who registered a call is the database's to say (0113).
--   The Hotline engineer is the only person trained on the vigilance questions,
--   so a call registered by anyone else has to be findable — which means
--   `created_by` has to be a fact, not a field the caller fills in.
--   A signed-in caller who SENDS someone else's id is overridden with their
--   own. A caller who sends nothing is stamped, as before.
--   An ADMINISTRATIVE connection (auth.uid() null — a migration, a restore) is
--   NOT overridden: forcing null there would erase a restored row's provenance.
-- Superuser bypasses RLS, so the scoped checks run as `authenticated`.
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('c0c0c0c0-0000-0000-0000-000000000001','cc_hotline@x.com'),
 ('c0c0c0c0-0000-0000-0000-000000000002','cc_other@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('c0c0c0c0-0000-0000-0000-000000000001','cc_hotline@x.com','Sivarani (Hotline)','hotline'),
 ('c0c0c0c0-0000-0000-0000-000000000002','cc_other@x.com','Somebody Else','hotline')
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

\echo '--- 1. a signed-in caller who sends NOTHING is stamped with their own id ---'
\echo 'expect: cc_hotline@x.com'
call public.be('cc_hotline@x.com');
begin;
  set local role authenticated;
  insert into public.field_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                  complaint_reported, standard_complaint, allocated_to)
  values ('CR-1', 'FIELD', 'CRPROD', '1', current_date, 'HOSP', 'x', 'y', 'Someone Else');
commit;
select ucn, (select email from auth.users u where u.id = c.created_by) as registered_by
  from public.field_calls c where ucn = 'CR-1';

\echo '--- 2. ...and one who SENDS SOMEBODY ELSE''S id is overridden with their own ---'
\echo 'expect: cc_hotline@x.com, NOT cc_other@x.com'
call public.be('cc_hotline@x.com');
begin;
  set local role authenticated;
  insert into public.field_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                  complaint_reported, standard_complaint, allocated_to, created_by)
  values ('CR-2', 'FIELD', 'CRPROD', '2', current_date, 'HOSP', 'x', 'y', 'Someone Else',
          'c0c0c0c0-0000-0000-0000-000000000002');
commit;
select ucn, (select email from auth.users u where u.id = c.created_by) as registered_by
  from public.field_calls c where ucn = 'CR-2';

\echo '--- 3. a DIFFERENT signed-in user is recorded as themselves ---'
\echo 'expect: cc_other@x.com — this is the case the register has to surface'
call public.be('cc_other@x.com');
begin;
  set local role authenticated;
  insert into public.field_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                  complaint_reported, standard_complaint, allocated_to)
  values ('CR-3', 'FIELD', 'CRPROD', '3', current_date, 'HOSP', 'x', 'y', 'Someone Else');
commit;
select ucn, (select email from auth.users u where u.id = c.created_by) as registered_by
  from public.field_calls c where ucn = 'CR-3';

\echo '--- 4. an ADMINISTRATIVE connection keeps what it supplies ---'
\echo 'expect: cc_other@x.com — a restore must not lose the original author'
insert into public.field_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                complaint_reported, standard_complaint, allocated_to, created_by)
values ('CR-4', 'FIELD', 'CRPROD', '4', current_date, 'HOSP', 'x', 'y', 'Someone Else',
        'c0c0c0c0-0000-0000-0000-000000000002');
select ucn, (select email from auth.users u where u.id = c.created_by) as registered_by
  from public.field_calls c where ucn = 'CR-4';

\echo '--- 5. it applies to INSTALLATION and PM as well ---'
\echo 'expect: both cc_hotline@x.com'
call public.be('cc_hotline@x.com');
begin;
  set local role authenticated;
  insert into public.installation_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                         complaint_reported, standard_complaint, allocated_to, created_by)
  values ('CR-I1', 'INSTALLATION', 'CRPROD', '5', current_date, 'HOSP', 'x', 'y', 'Someone Else',
          'c0c0c0c0-0000-0000-0000-000000000002');
  insert into public.pm_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                               complaint_reported, standard_complaint, allocated_to, created_by)
  values ('CR-P1', 'PM', 'CRPROD', '6', current_date, 'HOSP', 'x', 'y', 'Someone Else',
          'c0c0c0c0-0000-0000-0000-000000000002');
commit;
select ucn, (select email from auth.users u where u.id = c.created_by) as registered_by
  from public.calls c where ucn in ('CR-I1', 'CR-P1') order by ucn;

\echo '--- 6. THE QUESTION THIS EXISTS TO ANSWER: which calls did somebody else register? ---'
\echo 'expect: CR-3 only. CR-4 is excluded deliberately -- it was inserted by an'
\echo 'ADMINISTRATIVE connection (test 4), which is a restore, not a registration.'
select c.ucn, p.full_name
  from public.field_calls c
  join public.profiles p on p.id = c.created_by
 where c.ucn in ('CR-1', 'CR-2', 'CR-3')
   and p.email <> 'cc_hotline@x.com'
 order by c.ucn;

\echo '--- 7. cleanup ---'
delete from public.field_calls where ucn like 'CR-%';
delete from public.installation_calls where ucn like 'CR-%';
delete from public.pm_calls where ucn like 'CR-%';
delete from public.profiles where email like 'cc_%@x.com';
