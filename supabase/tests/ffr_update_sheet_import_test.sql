-- ===========================================================================
-- THE OLD FFR UPDATE LOG, LOADED (0409).
--
--   A sheet row goes to the register row with its FFR number AND UCN (spaces
--   and case aside) and becomes a dated entry in that report's update log,
--   signed "FFR Update sheet (import)", carrying only the fields it filled
--   that differ from the update before it; the report then carries the latest
--   non-blank value of each field, a blank never emptying one; a field changed
--   on the form AFTER the sheet's update keeps the form's value; the apply
--   writes no second log entry; a row whose UCN differs, whose FFR number is
--   unknown or that has no Timestamp is returned with the register's UCN and
--   nothing is written; loading again adds nothing; nobody without ffr.manage
--   AND bulk.upload may load, the public key cannot call it, and nobody can
--   write the loaded rows directly.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
 ('e1e1e409-0000-0000-0000-000000000001', 'ffrsheet_both@x.com'),
 ('e1e1e409-0000-0000-0000-000000000002', 'ffrsheet_ffr@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role, designation, extra_permissions) values
 ('e1e1e409-0000-0000-0000-000000000001', 'ffrsheet_both@x.com', 'SHEET LOADER', 'engineer', '', '["ffr.manage", "bulk.upload"]'),
 ('e1e1e409-0000-0000-0000-000000000002', 'ffrsheet_ffr@x.com', 'FFR ONLY', 'engineer', '', '["ffr.manage"]')
on conflict (id) do update set role = excluded.role, extra_permissions = excluded.extra_permissions;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

insert into public.field_failure_reports (ffr_no, ucn, customer_name, problem_reported, capa_responsibility, capa_no, capa_status, ffr_status, imported_from)
values ('FFR - 901/20', '20A09001', 'C1', 'P1', '', 'NA', 'Not required', 'Open', 'test'),
       ('FFR - 902/20', '20A09002', 'C2', 'P2', '', 'NA', 'Not required', 'Open', 'test');

-- FFR 902 is edited on the form on 01-Jan-2030, after the sheet: its CAPA Status is the form's.
update public.field_failure_reports set capa_status = 'In-Progress' where ffr_no = 'FFR - 902/20';
update public.ffr_history set changed_at = '2030-01-01 10:00+05:30'
 where ffr_no = 'FFR - 902/20' and action = 'update';

call public.be('ffrsheet_ffr@x.com');
set role authenticated;
\echo '-- expect ERROR: ffr.manage alone may not load the sheet'
select public.ffr_load_sheet_updates('[]'::jsonb);
reset role;

call public.be('ffrsheet_both@x.com');
set role authenticated;
create temp table res as
select public.ffr_load_sheet_updates($j$[
  {"row": 2, "ffr_no": "FFR - 901/20", "ucn": "20A09001", "at": "2020-03-09T16:41:11+05:30",
   "problem_status": "Under study", "service_observation": "-", "capa_responsibility": "NA", "capa_no": "", "capa_status": "", "ffr_status": "", "attachment_url": "", "additional_problem": "", "word_copy": ""},
  {"row": 3, "ffr_no": "ffr-901/20", "ucn": " 20a09001 ", "at": "2020-03-19T16:39:02+05:30",
   "problem_status": "Valve drawing corrected", "service_observation": "-", "capa_responsibility": "", "capa_no": "F-001/21", "capa_status": "Closed", "ffr_status": "Closed", "attachment_url": "", "additional_problem": "", "word_copy": "Yes"},
  {"row": 4, "ffr_no": "FFR - 901/20", "ucn": "20A09001", "at": "2020-03-20T10:00:00+05:30",
   "problem_status": "Valve drawing corrected", "service_observation": "", "capa_responsibility": "", "capa_no": "", "capa_status": "", "ffr_status": "", "attachment_url": "", "additional_problem": "", "word_copy": ""},
  {"row": 5, "ffr_no": "FFR - 902/20", "ucn": "20A09002", "at": "2021-02-10T17:08:33+05:30",
   "problem_status": "Isolated", "service_observation": "", "capa_responsibility": "DILIP", "capa_no": "", "capa_status": "Closed", "ffr_status": "Closed", "attachment_url": "", "additional_problem": "", "word_copy": ""},
  {"row": 6, "ffr_no": "FFR - 902/20", "ucn": "20I03023", "at": "2021-02-19T19:17:23+05:30",
   "problem_status": "Other unit", "service_observation": "", "capa_responsibility": "", "capa_no": "", "capa_status": "", "ffr_status": "", "attachment_url": "", "additional_problem": "", "word_copy": ""},
  {"row": 7, "ffr_no": "FFR - 999/20", "ucn": "20A09999", "at": "2021-02-19T19:17:23+05:30"},
  {"row": 8, "ffr_no": "FFR - 901/20", "ucn": "20A09001"}
]$j$::jsonb) as r;
reset role;

select 'four rows load: three on 901, one on 902' as t,
       (select (r ->> 'loaded')::int = 4 from res) as ok;
select '...the third 901 row repeats the second and is not a log entry' as t,
       (select (r ->> 'unchanged')::int = 1 from res)
   and (select count(*) = 2 from public.ffr_history where ffr_no = 'FFR - 901/20' and action = 'sheet') as ok;
select 'each entry is dated by the sheet and signed by it' as t,
       (select count(*) = 3 from public.ffr_history
         where action = 'sheet' and changed_by is null and changed_by_name = 'FFR Update sheet (import)'
           and changed_at in ('2020-03-09T16:41:11+05:30', '2020-03-19T16:39:02+05:30', '2021-02-10T17:08:33+05:30')) as ok;
select 'the second entry carries only what changed, from the earlier update, never a blank' as t,
       (select changes ? 'problem_status' and changes -> 'problem_status' ->> 'from' = 'Under study'
           and changes ? 'capa_no' and not changes ? 'service_observation' and not changes ? 'capa_responsibility'
          from public.ffr_history where ffr_no = 'FFR - 901/20' and changed_at = '2020-03-19T16:39:02+05:30') as ok;
select 'the report carries the latest non-blank value of each field' as t,
       (select problem_status = 'Valve drawing corrected' and service_observation = '-' and capa_responsibility = 'NA'
           and capa_no = 'F-001/21' and capa_status = 'Closed' and ffr_status = 'Closed'
          from public.field_failure_reports where ffr_no = 'FFR - 901/20') as ok;
select 'the apply wrote no second log entry' as t,
       not exists (select 1 from public.ffr_history where ffr_no = 'FFR - 901/20' and action = 'update') as ok;
select 'a field changed on the form after the sheet keeps the form''s value; the others apply' as t,
       (select capa_status = 'In-Progress' and ffr_status = 'Closed' and capa_responsibility = 'DILIP' and problem_status = 'Isolated'
          from public.field_failure_reports where ffr_no = 'FFR - 902/20')
   and (select (r ->> 'kept_newer')::int = 1 from res) as ok;
select 'a different UCN is returned with the register''s, and nothing is written for it' as t,
       (select count(*) = 1 from res, jsonb_array_elements(r -> 'rejected') e
         where (e ->> 'row')::int = 6 and e ->> 'register_ucn' = '20A09002' and e ->> 'reason' like '%different UCN%')
   and not exists (select 1 from public.ffr_sheet_updates where ucn = '20I03023') as ok;
select 'an unknown FFR number and a row with no Timestamp are returned' as t,
       (select count(*) = 2 from res, jsonb_array_elements(r -> 'rejected') e where (e ->> 'row')::int in (7, 8)) as ok;
select '"Generate FFR Word Copy?" is kept on the loaded row' as t,
       exists (select 1 from public.ffr_sheet_updates where ffr_no = 'ffr-901/20' and word_copy = 'Yes') as ok;

call public.be('ffrsheet_both@x.com');
set role authenticated;
create temp table res2 as
select public.ffr_load_sheet_updates($j$[
  {"row": 2, "ffr_no": "FFR - 901/20", "ucn": "20A09001", "at": "2020-03-09T16:41:11+05:30", "problem_status": "Under study"}
]$j$::jsonb) as r;
\echo '-- expect ERROR: a loaded row cannot be written directly'
insert into public.ffr_sheet_updates (ffr_id, updated_at) select id, now() from public.field_failure_reports limit 1;
reset role;
select 'loading again adds nothing' as t,
       (select (r ->> 'loaded')::int = 0 and (r ->> 'already')::int = 1 from res2)
   and (select count(*) = 2 from public.ffr_history where ffr_no = 'FFR - 901/20' and action = 'sheet') as ok;

select 'the public key cannot call the load' as t,
       not has_function_privilege('anon', 'public.ffr_load_sheet_updates(jsonb)', 'execute') as ok;
update public.field_failure_reports set remarks = 'checked' where ffr_no = 'FFR - 901/20';
select 'an ordinary form edit is still logged' as t,
       exists (select 1 from public.ffr_history where ffr_no = 'FFR - 901/20' and action = 'update' and changes ? 'remarks') as ok;
