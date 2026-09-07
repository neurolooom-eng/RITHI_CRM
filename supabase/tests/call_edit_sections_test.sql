-- ===========================================================================
-- EDITING A CALL IS FOUR RIGHTS, NOT ONE (0127).
--
-- "edit gives access to edit the whole call.. which is not required for the
-- managers. at the same time the Hotline engineer can edit the complete call..
-- so 1 single edit permission will not suffice."
--
-- What this suite is really holding:
--   * `calls.edit` still means ALL of it, so a role that had it loses nothing
--     the day the sections appear — that is what makes this safe to ship;
--   * a role with ONE section may change that section and is refused every
--     other, through PostgREST and not merely on the form;
--   * the refusal names the section, so somebody reads it and knows what to
--     ask for;
--   * a statement that changes two sections is refused if EITHER is missing —
--     no half-write;
--   * EVERY change to a vigilance answer is logged with who, when, from and
--     to, including an administrator's, and registration logs nothing.
--
-- Superuser bypasses RLS, so every scoped check runs as `authenticated`.
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('c2c2c2c2-0000-0000-0000-000000000001','se_admin@x.com'),
 ('c2c2c2c2-0000-0000-0000-000000000002','se_hotline@x.com'),
 ('c2c2c2c2-0000-0000-0000-000000000003','se_mgr@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('c2c2c2c2-0000-0000-0000-000000000001','se_admin@x.com','SE Admin','admin'),
 ('c2c2c2c2-0000-0000-0000-000000000002','se_hotline@x.com','SE Hotline','se_full'),
 ('c2c2c2c2-0000-0000-0000-000000000003','se_mgr@x.com','SE Manager','se_contact')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

-- The Hotline shape: the WHOLE call, through the parent right alone.
insert into public.app_roles (role, label, permissions) values
 ('se_full','SE Full',
  '["calls.view","calls.edit","data.view_all","mod:/field-calls"]'::jsonb),
-- The manager shape: contact details only. No calls.edit, no other section.
 ('se_contact','SE Contact only',
  '["calls.view","calls.edit.contact","data.view_all","mod:/field-calls"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;

delete from public.call_vigilance_changes where ucn like 'SE-%';
delete from public.field_calls where ucn like 'SE-%';
insert into public.field_calls (ucn, call_number, call_type, product_name, serial, reg_date,
                                party_name, city, state, item_status,
                                complaint_reported, standard_complaint, breakdown_date,
                                customer_name, customer_number, customer_designation,
                                public_health_threat, death, serious_incident, allocated_to)
values ('SE-1','C-1','FIELD','VEGA','1', current_date,'Hosp A','Chennai','TN','Warranty',
        'first report','ALARM','2026-09-01','Dr A','111','HOD','NO','NO','NO','Eng One');

\echo '--- 1. REGISTERING a call writes NO vigilance history ---'
\echo 'expect: 0 — the answers were given, not changed'
select count(*) as logged from public.call_vigilance_changes where ucn = 'SE-1';

\echo '--- 2. calls.edit alone still edits EVERYTHING (the parent right) ---'
\echo 'expect: all four sections change in one statement, no error'
call public.be('se_hotline@x.com');
begin;
  set local role authenticated;
  update public.field_calls
     set complaint_reported = 'hotline edited', party_name = 'Hosp B',
         customer_number = '222', serious_incident = 'YES'
   where ucn = 'SE-1';
commit;
select complaint_reported, party_name, customer_number, serious_incident
  from public.field_calls where ucn = 'SE-1';

\echo '--- 3. ...and that vigilance change WAS recorded ---'
\echo 'expect: serious_incident NO -> YES, by SE Hotline'
select v.field, v.was, v.now_is, p.full_name as changed_by
  from public.call_vigilance_changes v left join public.profiles p on p.id = v.changed_by
 where v.ucn = 'SE-1' order by v.id;

\echo '--- 4. the CONTACT-only role may change contact details ---'
\echo 'expect: Dr B / 333, no error'
call public.be('se_mgr@x.com');
begin;
  set local role authenticated;
  update public.field_calls set customer_name = 'Dr B', customer_number = '333' where ucn = 'SE-1';
commit;
select customer_name, customer_number from public.field_calls where ucn = 'SE-1';

\echo '--- 5. ...and may NOT touch the complaint ---'
\echo 'expect ERROR: changing the complaint needs the "Edit the complaint" permission'
call public.be('se_mgr@x.com');
begin;
  set local role authenticated;
  update public.field_calls set complaint_reported = 'manager tried' where ucn = 'SE-1';
commit;

\echo '--- 6. ...nor the machine ---'
\echo 'expect ERROR: changing the customer or the machine needs the "Edit customer & product" permission'
call public.be('se_mgr@x.com');
begin;
  set local role authenticated;
  update public.field_calls set serial = 'TAMPERED' where ucn = 'SE-1';
commit;

\echo '--- 7. ...nor, above all, the vigilance answers ---'
\echo 'expect ERROR: changing the vigilance answers needs the "Edit the vigilance answers" permission'
call public.be('se_mgr@x.com');
begin;
  set local role authenticated;
  update public.field_calls set death = 'YES' where ucn = 'SE-1';
commit;

\echo '--- 8. one statement touching TWO sections is refused if either is missing ---'
\echo 'expect ERROR: no half-write — the contact change goes back with it'
call public.be('se_mgr@x.com');
begin;
  set local role authenticated;
  update public.field_calls set customer_designation = 'CEO', serial = 'ALSO TAMPERED' where ucn = 'SE-1';
commit;
\echo 'expect: HOD and 1 — neither the designation nor the serial moved'
select customer_designation, serial from public.field_calls where ucn = 'SE-1';

\echo '--- 9. nothing the manager was refused was written ---'
\echo 'expect: hotline edited | Hosp B | 1 | NO'
select complaint_reported, party_name, serial, death from public.field_calls where ucn = 'SE-1';

\echo '--- 10. an ADMIN may change a vigilance answer, and it is recorded too ---'
\echo 'expect: death NO -> YES, by SE Admin'
call public.be('se_admin@x.com');
begin;
  set local role authenticated;
  update public.field_calls set death = 'YES' where ucn = 'SE-1';
commit;
select v.field, v.was, v.now_is, p.full_name as changed_by
  from public.call_vigilance_changes v left join public.profiles p on p.id = v.changed_by
 where v.ucn = 'SE-1' order by v.id;

\echo '--- 11. writing the SAME answer is not a change, and is not logged ---'
\echo 'expect: still 2 rows'
call public.be('se_admin@x.com');
begin;
  set local role authenticated;
  update public.field_calls set death = 'YES' where ucn = 'SE-1';
commit;
select count(*) as logged from public.call_vigilance_changes where ucn = 'SE-1';

\echo '--- 12. the guard is on all THREE call tables ---'
\echo 'expect: three rows'
select c.relname as call_table
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
 where t.tgname = 'zz_calls_edit_section_guard' and not t.tgisinternal
 order by 1;

\echo '--- 13. the vigilance record cannot be written or rewritten by hand ---'
\echo 'expect ERROR on the insert (no insert policy), and UPDATE 0 on the'
\echo 'expect update (no update policy, so the row is simply not reachable)'
call public.be('se_admin@x.com');
begin;
  set local role authenticated;
  insert into public.call_vigilance_changes (ucn, field, was, now_is) values ('SE-1','death','YES','NO');
commit;
begin;
  set local role authenticated;
  update public.call_vigilance_changes set now_is = 'NO' where ucn = 'SE-1';
commit;
\echo 'expect: the one death row, still YES, and 2 rows in all'
select (select count(*) from public.call_vigilance_changes where ucn = 'SE-1') as logged_in_all,
       (select max(now_is) from public.call_vigilance_changes where ucn = 'SE-1' and field = 'death') as death_still;
