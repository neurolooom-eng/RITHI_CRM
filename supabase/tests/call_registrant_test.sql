-- ===========================================================================
-- THE DESK OF RECORD, AND THE PERSON AT THE KEYBOARD (0114).
--
--   created_by         the Hotline desk a call belongs to. Defaults to the
--                      Hotline engineer (SIVARANI today), because she is the
--                      only person trained on the three vigilance questions.
--   actual_created_by  who actually typed it in — one of the stand-ins when
--                      she is on leave.
--
-- The two DISAGREEING is the finding this exists to produce. So both have to be
-- right, and only one of them may be chosen by the caller:
--   * actual_created_by is stamped from auth.uid() and a supplied value is
--     DISCARDED (0113's rule, moved to the column an enquiry rests on);
--   * created_by is accepted, but only when it names a hotline desk;
--   * an ADMINISTRATIVE connection (auth.uid() null — a migration, a restore)
--     keeps what it supplies, or a restore would lose its provenance.
--
-- Superuser bypasses RLS, so the scoped checks run as `authenticated`.
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('c0c0c0c0-0000-0000-0000-000000000001','cc_sivarani@x.com'),
 ('c0c0c0c0-0000-0000-0000-000000000002','cc_devika@x.com'),
 ('c0c0c0c0-0000-0000-0000-000000000003','cc_second_hotline@x.com'),
 ('c0c0c0c0-0000-0000-0000-000000000004','cc_karthik@x.com')
on conflict do nothing;
-- Exactly ONE hotline profile to begin with — the state the project is in
-- today, and the reason this needs no configuration to work. Devika registers
-- calls but is not trained, which is the whole point of separating the columns.
insert into public.profiles (id,email,full_name,role) values
 ('c0c0c0c0-0000-0000-0000-000000000001','cc_sivarani@x.com','Sivarani (Hotline)','hotline'),
 ('c0c0c0c0-0000-0000-0000-000000000002','cc_devika@x.com','Devika M','rm'),
 ('c0c0c0c0-0000-0000-0000-000000000004','cc_karthik@x.com','Karthik S','commercial')
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

\echo '--- 1. with one hotline profile, the default desk is hers ---'
\echo 'expect: cc_sivarani@x.com'
select (select email from auth.users u where u.id = public.default_registrant()) as default_desk;

\echo '--- 2. THE CASE THIS EXISTS FOR: somebody else registers a call ---'
\echo 'expect: desk cc_sivarani@x.com, keyboard cc_devika@x.com'
call public.be('cc_devika@x.com');
begin;
  set local role authenticated;
  insert into public.field_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                  complaint_reported, standard_complaint, allocated_to)
  values ('CR-1', 'FIELD', 'CRPROD', '1', current_date, 'HOSP', 'x', 'y', 'Someone Else');
commit;
select ucn,
       (select email from auth.users u where u.id = c.created_by)        as desk,
       (select email from auth.users u where u.id = c.actual_created_by) as keyboard
  from public.field_calls c where ucn = 'CR-1';

\echo '--- 3. the Hotline engineer registering it herself: the two agree ---'
\echo 'expect: both cc_sivarani@x.com'
call public.be('cc_sivarani@x.com');
begin;
  set local role authenticated;
  insert into public.field_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                  complaint_reported, standard_complaint, allocated_to)
  values ('CR-2', 'FIELD', 'CRPROD', '2', current_date, 'HOSP', 'x', 'y', 'Someone Else');
commit;
select ucn,
       (select email from auth.users u where u.id = c.created_by)        as desk,
       (select email from auth.users u where u.id = c.actual_created_by) as keyboard
  from public.field_calls c where ucn = 'CR-2';

\echo '--- 4. a caller cannot name a desk that is not one ---'
\echo 'expect: desk cc_sivarani@x.com (NOT devika), keyboard cc_devika@x.com'
call public.be('cc_devika@x.com');
begin;
  set local role authenticated;
  insert into public.field_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                  complaint_reported, standard_complaint, allocated_to, created_by)
  values ('CR-3', 'FIELD', 'CRPROD', '3', current_date, 'HOSP', 'x', 'y', 'Someone Else',
          'c0c0c0c0-0000-0000-0000-000000000002');
commit;
select ucn,
       (select email from auth.users u where u.id = c.created_by)        as desk,
       (select email from auth.users u where u.id = c.actual_created_by) as keyboard
  from public.field_calls c where ucn = 'CR-3';

\echo '--- 5. ...and cannot claim somebody else was at the keyboard ---'
\echo 'expect: keyboard cc_devika@x.com, NOT cc_sivarani@x.com'
call public.be('cc_devika@x.com');
begin;
  set local role authenticated;
  insert into public.field_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                  complaint_reported, standard_complaint, allocated_to, actual_created_by)
  values ('CR-4', 'FIELD', 'CRPROD', '4', current_date, 'HOSP', 'x', 'y', 'Someone Else',
          'c0c0c0c0-0000-0000-0000-000000000001');
commit;
select ucn,
       (select email from auth.users u where u.id = c.created_by)        as desk,
       (select email from auth.users u where u.id = c.actual_created_by) as keyboard
  from public.field_calls c where ucn = 'CR-4';

\echo '--- 6. Devika can still READ the call she registered ---'
\echo 'expect: 3 rows (CR-1, CR-3, CR-4) -- allocated to a name she cannot see,'
\echo 'so the only arm that can match is actual_created_by = auth.uid()'
call public.be('cc_devika@x.com');
begin;
  set local role authenticated;
  select count(*) as readable_by_devika from public.field_calls
   where ucn in ('CR-1', 'CR-2', 'CR-3', 'CR-4');
commit;

\echo '--- 7. an ADMINISTRATIVE connection keeps what it supplies ---'
\echo 'expect: desk cc_sivarani@x.com, keyboard cc_devika@x.com -- a restore must'
\echo 'not rewrite either column'
call public.be(null);
insert into public.field_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                complaint_reported, standard_complaint, allocated_to,
                                created_by, actual_created_by)
values ('CR-5', 'FIELD', 'CRPROD', '5', current_date, 'HOSP', 'x', 'y', 'Someone Else',
        'c0c0c0c0-0000-0000-0000-000000000001', 'c0c0c0c0-0000-0000-0000-000000000002');
select ucn,
       (select email from auth.users u where u.id = c.created_by)        as desk,
       (select email from auth.users u where u.id = c.actual_created_by) as keyboard
  from public.field_calls c where ucn = 'CR-5';

\echo '--- 8. ...and an administrative row with only ONE of them fills the other ---'
\echo 'expect: both cc_sivarani@x.com -- this is the shape the 0114 backfill left'
\echo 'the sheet-era history in'
insert into public.field_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                complaint_reported, standard_complaint, allocated_to, created_by)
values ('CR-6', 'FIELD', 'CRPROD', '6', current_date, 'HOSP', 'x', 'y', 'Someone Else',
        'c0c0c0c0-0000-0000-0000-000000000001');
select ucn,
       (select email from auth.users u where u.id = c.created_by)        as desk,
       (select email from auth.users u where u.id = c.actual_created_by) as keyboard
  from public.field_calls c where ucn = 'CR-6';

\echo '--- 9. it applies to PM and INSTALLATION as well ---'
\echo 'expect: CR-P1 desk cc_sivarani@x.com / keyboard cc_devika@x.com,'
\echo 'CR-I1 desk cc_sivarani@x.com / keyboard cc_karthik@x.com.'
\echo 'Two people, because 0043 makes creating an INSTALLATION Commercial''s job:'
\echo 'Devika (rm) has calls.create but not install.create, so the stand-in who'
\echo 'registers an installation is a different one -- and the desk is the same.'
call public.be('cc_devika@x.com');
begin;
  set local role authenticated;
  insert into public.pm_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                               complaint_reported, standard_complaint, allocated_to)
  values ('CR-P1', 'PM', 'CRPROD', '8', current_date, 'HOSP', 'x', 'y', 'Someone Else');
commit;
call public.be('cc_karthik@x.com');
begin;
  set local role authenticated;
  insert into public.installation_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                         complaint_reported, standard_complaint, allocated_to)
  values ('CR-I1', 'INSTALLATION', 'CRPROD', '7', current_date, 'HOSP', 'x', 'y', 'Someone Else');
commit;
select ucn,
       (select email from auth.users u where u.id = c.created_by)        as desk,
       (select email from auth.users u where u.id = c.actual_created_by) as keyboard
  from public.calls c where ucn in ('CR-I1', 'CR-P1') order by ucn;

\echo '--- 10. THE QUESTION THIS ANSWERS: which calls did an untrained person register? ---'
\echo 'expect: CR-1, CR-3, CR-4 and CR-P1 by Devika M, CR-I1 by Karthik S.'
\echo 'CR-5 is excluded even though its two columns differ, because it was not'
\echo 'registered here -- it was restored administratively, which is not somebody'
\echo 'answering the questions.'
select c.ucn, p.full_name as actually_registered_by
  from public.calls c
  join public.profiles p on p.id = c.actual_created_by
 where c.ucn like 'CR-%' and c.ucn <> 'CR-5'
   and c.created_by is distinct from c.actual_created_by
 order by c.ucn;

\echo '--- 11. an administrator can PIN the desk by email ---'
\echo 'expect: cc_second_hotline@x.com -- the setting wins over role alone'
insert into public.profiles (id,email,full_name,role) values
 ('c0c0c0c0-0000-0000-0000-000000000003','cc_second_hotline@x.com','Second Hotline','engineer')
on conflict (id) do update set role = excluded.role;
insert into public.app_settings (key, value) values ('calls.default_registrant_email','cc_second_hotline@x.com')
  on conflict (key) do update set value = excluded.value;
select (select email from auth.users u where u.id = public.default_registrant()) as default_desk;

\echo '--- 12. TWO hotline profiles and no setting is an AMBIGUITY, not a guess ---'
\echo 'expect: default_desk empty, and the desk falls back to whoever registered'
\echo 'it -- an unknown desk must not become an EMPTY one'
delete from public.app_settings where key = 'calls.default_registrant_email';
update public.profiles set role = 'hotline' where email = 'cc_second_hotline@x.com';
select (select email from auth.users u where u.id = public.default_registrant()) as default_desk;
call public.be('cc_devika@x.com');
begin;
  set local role authenticated;
  insert into public.field_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                  complaint_reported, standard_complaint, allocated_to)
  values ('CR-7', 'FIELD', 'CRPROD', '9', current_date, 'HOSP', 'x', 'y', 'Someone Else');
commit;
select ucn,
       (select email from auth.users u where u.id = c.created_by)        as desk,
       (select email from auth.users u where u.id = c.actual_created_by) as keyboard
  from public.field_calls c where ucn = 'CR-7';

\echo '--- 13. no row anywhere has a desk but no keyboard ---'
\echo 'expect: 0 -- the 0114 backfill copied created_by across, and the trigger'
\echo 'fills the gap on every path since'
select count(*) as desk_without_keyboard from public.calls
 where created_by is not null and actual_created_by is null;

\echo '--- 14. cleanup ---'
call public.be(null);
delete from public.field_calls where ucn like 'CR-%';
delete from public.installation_calls where ucn like 'CR-%';
delete from public.pm_calls where ucn like 'CR-%';
delete from public.profiles where email like 'cc_%@x.com';
delete from public.app_settings where key = 'calls.default_registrant_email';
