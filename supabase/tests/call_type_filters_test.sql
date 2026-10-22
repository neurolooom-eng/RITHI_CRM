-- ===========================================================================
-- THE KPI EXPORT'S CALL TYPE FILTER (0450) AND CALL HISTORY'S REGISTER (0451)
-- (the user, 2026-10-22: "In KPI Export - Add Call Type Filter. In Bulk
-- Upload, Historical Data, Add one more Field For PM / Field /
-- Installation"; asked, the register is recorded BESIDE the file's own Call
-- Type).
--
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

\echo
\echo '--- 1. KPI: each row says which register it came from, whatever its Call Type text ---'
insert into public.field_calls (ucn, call_number, call_type, product_name, serial, reg_date, party_name, allocated_to)
values ('CTF-F', 'F1', 'FIELD', 'VEGA', '1', date '2026-09-01', 'H', 'E');
insert into public.installation_calls (ucn, call_number, call_type, product_name, serial, reg_date, party_name, allocated_to)
values ('CTF-I', 'I1', 'INSTALLATION CALL', 'VEGA', '2', date '2026-09-01', 'H', 'E');
insert into public.pm_calls (ucn, call_number, call_type, product_name, serial, reg_date, party_name, allocated_to)
values ('CTF-P1', 'P1', 'P M VISIT', 'VEGA', '3', date '2026-09-01', 'H', 'E'),
       ('CTF-P2', 'P2', 'PM VISIT',  'VEGA', '4', date '2026-09-01', 'H', 'E');
select (select string_agg("UC Number" || '=' || "Register", ',' order by "UC Number") from public.kpi_field_inst where "UC Number" like 'CTF-%')
       = 'CTF-F=Field,CTF-I=Installation,CTF-P1=PM,CTF-P2=PM'
       as "Field, Installation and both PM spellings land in their register";
select (select count(*) from public.kpi_field_inst where "UC Number" like 'CTF-%' and "Register" = 'PM') = 2
       as "the PM filter finds both spellings";
select (select attname from pg_attribute where attrelid = 'public.kpi_field_inst'::regclass and attnum > 0 and not attisdropped
         order by attnum desc limit 1) = 'Register'
       as "Register is the LAST column -- every existing one keeps its place";
select (select reloptions from pg_class where oid = 'public.kpi_field_inst'::regclass) @> array['security_invoker=on']
       as "the view still reads as the caller";

\echo
\echo '--- 2. Call History: the register is recorded beside the file''s own Call Type ---'
insert into public.call_history (ucn, call_no, call_type, register) values
  ('CTF-H1', '1', 'INSTALLATION CALL',         'Installation'),
  ('CTF-H2', '1', 'FIELD',                     'PM'),
  ('CTF-H3', '1', 'P M VISIT',                 'Mixed — read each row''s Call Type'),
  ('CTF-H4', '1', 'INSTALLATION CALL & FIELD', 'Mixed — read each row''s Call Type'),
  ('CTF-H5', '1', 'DUPLICATE',                 'Mixed — read each row''s Call Type'),
  ('CTF-H6', '1', 'FIELD',                     null);
select (select string_agg(ucn || '=' || coalesce(register, '-') || '/' || call_type, ',' order by ucn) from public.call_history where ucn like 'CTF-H%')
       = 'CTF-H1=Installation/INSTALLATION CALL,CTF-H2=PM/FIELD,CTF-H3=PM/P M VISIT,CTF-H4=Installation/INSTALLATION CALL & FIELD,CTF-H5=Field/DUPLICATE,CTF-H6=-/FIELD'
       as "the choice is kept; Mixed reads each row; the file's Call Type is untouched; none chosen stays empty";
\echo '    expect ERROR below -- not one of the three, nor Mixed'
insert into public.call_history (ucn, call_no, call_type, register) values ('CTF-H7', '1', 'FIELD', 'Breakdown');
update public.call_history set call_status = 'Solved' where ucn = 'CTF-H1';
select (select register from public.call_history where ucn = 'CTF-H1') = 'Installation' as "an update that names no register keeps it";
insert into public.call_history (ucn, call_no, call_type, register) values ('CTF-H2', '1', 'FIELD', 'Field')
  on conflict (ucn, call_no) do update set register = excluded.register;
select (select register from public.call_history where ucn = 'CTF-H2') = 'Field' as "a re-load corrects it";
select public.call_register_of('P M VISIT') = 'PM' and public.call_register_of('pm') = 'PM'
   and public.call_register_of('Installation') = 'Installation' and public.call_register_of(null) = 'Field'
       as "the rule is call_table_for()'s";
