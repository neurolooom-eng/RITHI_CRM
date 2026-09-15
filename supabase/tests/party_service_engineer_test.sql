-- ===========================================================================
-- THE PARTY MASTER'S SERVICEMAN (0200). Every error printed is labelled
-- `expect ERROR`.
--
-- The rule under test: a party knows who looks after it, and that name answers
-- where the MACHINE cannot. The precedence was settled with the user before
-- any of it was built -- the machine's own Service Engineer still wins -- so
-- these sections test the FALLBACK, not a replacement.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

\echo ''
\echo '=== 1. the column exists and takes the Serviceman ======================'
insert into public.parties (party_name, city, state, service_engineer) values
  ('APOLLO HOSPITAL','CHENNAI','TN','SIVAKUMAR'),
  ('CITY HOSPITAL','MUMBAI','MH','MAYANK GUPTA'),
  ('NOBODY LOOKS AFTER THIS ONE','PUNE','MH','');
select party_name, service_engineer from public.parties order by party_name;

\echo ''
\echo '=== 2. the lookup answers by NAME, however it is typed ================='
-- It is keyed on `name_key` -- the generated lower(btrim(party_name)) that
-- carries the unique index -- so the form finds the party by the same key the
-- importer matched on, and the two cannot disagree about which party this is.
select public.party_service_engineer('APOLLO HOSPITAL')   as exact,
       public.party_service_engineer('  apollo hospital ') as messy,
       public.party_service_engineer('Apollo Hospital')    as mixed_case;

\echo ''
\echo '=== 3. a party nobody has recorded is EMPTY, never null ================'
-- One thing for the caller to test. A null here would reach the form as the
-- string "null" or as a crash, on a prefill that is meant to cost nothing.
select case when public.party_service_engineer('NO SUCH HOSPITAL') = '' then 'EMPTY (correct)'
            else 'got: ' || coalesce(public.party_service_engineer('NO SUCH HOSPITAL'), '<NULL>') end as unknown_party,
       case when public.party_service_engineer('NOBODY LOOKS AFTER THIS ONE') = '' then 'EMPTY (correct)'
            else 'unexpected' end                                                                    as blank_serviceman,
       case when public.party_service_engineer('') = '' then 'EMPTY (correct)' else 'unexpected' end as no_party_at_all,
       case when public.party_service_engineer(null) = '' then 'EMPTY (correct)' else 'unexpected' end as null_party;

\echo ''
\echo '=== 4. THE BACKFILL recovers a Serviceman already sitting in `extra` ==='
-- The parties loaded before 0200 came in through extraInto:'extra', so the
-- value is on the row under its ORIGINAL SPREADSHEET HEADING. Nobody is asked
-- to upload the file again.
insert into public.parties (party_name, extra) values
  ('OLD LOAD ONE','{"Serviceman":"FRANKLIN","Salesman":"SOMEBODY ELSE"}'::jsonb),
  ('OLD LOAD TWO','{"Service Engineer":"  GEETHA  "}'::jsonb),
  ('OLD LOAD KEEP','{"Serviceman":"WOULD OVERWRITE"}'::jsonb);
update public.parties set service_engineer = 'SET BY HAND' where party_name = 'OLD LOAD KEEP';

update public.parties p
   set service_engineer = coalesce(nullif(btrim(p.extra ->> 'Serviceman'), ''),
                                   nullif(btrim(p.extra ->> 'Service Engineer'), ''),
                                   nullif(btrim(p.extra ->> 'SERVICEMAN'), ''),
                                   nullif(btrim(p.extra ->> 'Service Man'), ''))
 where coalesce(btrim(p.service_engineer), '') = ''
   and coalesce(nullif(btrim(p.extra ->> 'Serviceman'), ''),
                nullif(btrim(p.extra ->> 'Service Engineer'), ''),
                nullif(btrim(p.extra ->> 'SERVICEMAN'), ''),
                nullif(btrim(p.extra ->> 'Service Man'), '')) is not null;

select party_name, service_engineer
  from public.parties where party_name like 'OLD LOAD%' order by party_name;
\echo '    ONE takes Serviceman; TWO takes the other spelling, trimmed;'
\echo '    KEEP is UNTOUCHED -- a correction made on the screen is not undone.'
\echo '    And the Salesman is never mistaken for the Serviceman.'

\echo ''
\echo '=== 5. it is a PREFILL: the column assigns nothing by itself ==========='
-- allocated_to keeps no default and gains no trigger from 0200. An assignment
-- the database made would be a rule nobody could see on the form, and one
-- nobody could correct at the keyboard once the party master went stale.
insert into public.parties (party_name, service_engineer) values ('TRIGGER TEST PARTY','SIVAKUMAR');
insert into public.products (serial_number, item_name, party_name)
values ('PSE-1','ORION-G','TRIGGER TEST PARTY');
insert into public.field_calls (ucn, party_name, product_name, serial, complaint_reported)
values ('PSE-TEST-1','TRIGGER TEST PARTY','ORION-G','PSE-1','no engineer named');
select case when coalesce(allocated_to,'') = '' then 'BLANK (correct -- nothing assigned it)'
            else 'ASSIGNED: ' || allocated_to end as allocated_to
  from public.field_calls where ucn = 'PSE-TEST-1';

\echo ''
\echo '=== 6. ...and a blank allottee still leaves the call visible to all ===='
-- 0200 must not change this: base.sql has always treated an unallotted call as
-- everyone's to see, which is what makes "register it now, allot it later"
-- work. If the prefill ever became an assignment, this is the rule it would
-- quietly take away.
select public.can_see_call('') as blank_is_visible_to_everyone;

\echo ''
\echo '=== 7. the party name is still unique, so the lookup cannot be two ====='
\echo '    expect ERROR: duplicate key value violates unique constraint'
insert into public.parties (party_name, service_engineer) values ('apollo hospital','SOMEBODY ELSE');
select public.party_service_engineer('APOLLO HOSPITAL') as still_sivakumar;
