-- ===========================================================================
-- A USER MASTER RENAME CARRIES THE PERSON'S RECORDS (0259-0262, finding 23).
--
-- WHAT THIS PROVES, as a signed-in ADMINISTRATOR (the only role that can
-- change a name) -- never the superuser, which would skip row-level security
-- and so hide a write the policies refuse:
--   1. every column that decides whose a record is follows the new name --
--      calls, requests, spares, consumption, hand stock, transfers, and the
--      Party Master / Product Database service engineer -- including a row
--      spelled with different case and spacing;
--   2. the guards that refuse a change of engineer let THIS through (an
--      answered request, a dispatched spare request, a consumption line) and
--      no "Call allotted to you" is sent;
--   3. the person's manager still sees the calls, and the hand stock is ONE
--      balance under the new name, the same size as before;
--   4. what must NOT move does not: another engineer's rows, and a signature
--      column (recorded_by) that happens to hold the old name;
--   5. the guards still refuse the same change outside a rename, and no
--      ticket is left behind;
--   6. a duplicate old name moves nothing.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('02590000-0000-0000-0000-000000000001', 'rr-admin@x.com'),
  ('02590000-0000-0000-0000-000000000002', 'rr-rm@x.com'),
  ('02590000-0000-0000-0000-000000000003', 'rr-eng@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('02590000-0000-0000-0000-000000000001', 'rr-admin@x.com', 'RR Admin', 'admin'),
  ('02590000-0000-0000-0000-000000000002', 'rr-rm@x.com',    'RR Manager', 'rm'),
  ('02590000-0000-0000-0000-000000000003', 'rr-eng@x.com',   'Eng Old',  'engineer')
on conflict (id) do update set role = excluded.role;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

insert into public.user_directory (name, email, reporting_manager) values
  ('RR Manager', 'rr-rm@x.com',  ''),
  ('Eng Old',    'rr-eng@x.com', 'RR Manager'),
  ('Eng Other',  'rr-oth@x.com', 'RR Manager'),
  ('Twin',       'tw1@x.com',    ''),
  ('Twin',       'tw2@x.com',    '');

-- ---- the records, as the superuser (loaders), under the old name ----------
insert into public.field_calls (ucn, call_number, party_name, allocated_to, allocated_to_email)
values ('RR-F1', 'CN-RR1', 'RR HOSP', 'Eng Old', 'rr-eng@x.com'),
       ('RR-F2', 'CN-RR2', 'RR HOSP', ' eng old ', 'rr-eng@x.com'),   -- other case and spacing
       ('RR-F3', 'CN-RR3', 'RR HOSP', 'Eng Other', 'rr-oth@x.com');
insert into public.installation_calls (ucn, call_type, reg_date, party_name, product_name, serial, allocated_to)
values ('RR-I1', 'INSTALLATION', current_date, 'RR HOSP', 'RR PROD', 'RR1', 'Eng Old');
insert into public.pm_calls (ucn, call_type, party_name, allocated_to) values ('RR-P1', 'PM', 'RR HOSP', 'Eng Old');
insert into public.call_requests (party_name, engineer, ucn) values ('RR HOSP', 'Eng Old', 'RR-F1');  -- answered
insert into public.pending_registrations (engineer) values ('Eng Old');
insert into public.spare_requests (uid, req_type, engineer, engineer_email, item_status, ucn, dispatched_at)
values ('SRQ-RR', 'Call Based', 'Eng Old', 'rr-eng@x.com', 'CMC', 'RR-F1', now());          -- dispatched
insert into public.spare_dispatches (uid, engineer) values ('SD-RR', 'Eng Old');
insert into public.handstock_opening (engineer, part, qty, as_of, source)
values ('Eng Old', 'RRP-1|Widget', 5, current_date, 'test');
insert into public.spare_issue_history (engineer, part, qty, source) values ('Eng Old', 'RRP-1|Widget', 2, 'test');
insert into public.spare_consumption_history (engineer, part, qty, source) values ('Eng Old', 'RRP-1|Widget', 1, 'test');
insert into public.reports (uid, ucn, visit_at) values ('RR-V1', 'RR-F1', now());
insert into public.spare_consumption (ucn, call_number, part, qty, engineer, recorded_by, source)
values ('RR-F1', 'CN-RR1', 'RRP-1|Widget', 1, 'Eng Old', 'Eng Old', 'Report');
insert into public.material_returns (uid, engineer, part, good_qty, source) values ('MRN-RR', 'Eng Old', 'RRP-1|Widget', 1, 'import');
insert into public.stock_transfers (uid, from_engineer, to_engineer) values ('ST-RR1', 'Eng Old', 'Eng Other'),
                                                                           ('ST-RR2', 'Eng Other', 'Eng Old');
insert into public.parties (party_name, service_engineer) values ('RR HOSP', 'Eng Old');
insert into public.products (item_name, serial_number, party_name, service_engineer)
values ('RR PROD', 'RR1', 'RR HOSP', 'Eng Old');

select 'fixture: request answered, spare request dispatched' as check,
       (select status from public.call_requests where engineer = 'Eng Old') as request_status_not_pending,
       public.spare_request_is_dispatched('SRQ-RR')::text as dispatched_should_be_true;

create temp table before_stock as
  select part_code, on_hand from public.handstock_balance where engineer_key = 'eng old';
create temp table before_notes as
  select count(*) as n from public.notifications where kind = 'call_allotted';

\echo ''
\echo '--- the rename, as an administrator ---'
call public.be('rr-admin@x.com');
set role authenticated;
update public.user_directory set name = 'Eng New' where email = 'rr-eng@x.com';
reset role;

\echo ''
\echo '--- 1. every column that decides whose a record is followed ---'
do $$
declare left_behind text;
begin
  select string_agg(t, ', ') into left_behind from (
    select 'field_calls' t from public.field_calls where ucn in ('RR-F1','RR-F2') and allocated_to <> 'Eng New'
    union all select 'installation_calls' from public.installation_calls where ucn = 'RR-I1' and allocated_to <> 'Eng New'
    union all select 'pm_calls' from public.pm_calls where ucn = 'RR-P1' and allocated_to <> 'Eng New'
    union all select 'call_requests' from public.call_requests where party_name = 'RR HOSP' and engineer <> 'Eng New'
    union all select 'pending_registrations' from public.pending_registrations where lower(btrim(engineer)) = 'eng old'
    union all select 'spare_requests' from public.spare_requests where uid = 'SRQ-RR' and engineer <> 'Eng New'
    union all select 'spare_dispatches' from public.spare_dispatches where uid = 'SD-RR' and engineer <> 'Eng New'
    union all select 'handstock_opening' from public.handstock_opening where part = 'RRP-1|Widget' and engineer <> 'Eng New'
    union all select 'spare_issue_history' from public.spare_issue_history where part = 'RRP-1|Widget' and engineer <> 'Eng New'
    union all select 'spare_consumption_history' from public.spare_consumption_history where part = 'RRP-1|Widget' and engineer <> 'Eng New'
    union all select 'spare_consumption' from public.spare_consumption where ucn = 'RR-F1' and engineer <> 'Eng New'
    union all select 'material_returns' from public.material_returns where uid = 'MRN-RR' and engineer <> 'Eng New'
    union all select 'stock_transfers.from' from public.stock_transfers where uid = 'ST-RR1' and from_engineer <> 'Eng New'
    union all select 'stock_transfers.to' from public.stock_transfers where uid = 'ST-RR2' and to_engineer <> 'Eng New'
    union all select 'parties' from public.parties where party_name = 'RR HOSP' and service_engineer <> 'Eng New'
    union all select 'products' from public.products where serial_number = 'RR1' and service_engineer <> 'Eng New'
  ) x;
  if left_behind is not null then raise exception 'still under the old name: %', left_behind; end if;
  -- A missing fixture row would pass the test above vacuously.
  if (select count(*) from public.pm_calls where ucn = 'RR-P1') <> 1
     or (select count(*) from public.material_returns where uid = 'MRN-RR') <> 1
     or (select count(*) from public.installation_calls where ucn = 'RR-I1') <> 1
     or (select count(*) from public.spare_consumption where ucn = 'RR-F1') <> 1
     or (select count(*) from public.pending_registrations where engineer = 'Eng New') <> 1 then
    raise exception 'fixture: a record the test relies on was not created';
  end if;
  raise notice 'ok: all 16 columns follow the new name';
end $$;

\echo ''
\echo '--- 2 and 3. no allotment notice; the manager still sees the calls; one stock balance ---'
call public.be('rr-rm@x.com');
set role authenticated;
create temp table rm_sees as select ucn from public.field_calls where ucn like 'RR-F%';
reset role;
do $$
declare n_now bigint; seen text; b text; a text;
begin
  select count(*) into n_now from public.notifications where kind = 'call_allotted';
  if n_now <> (select n from before_notes) then
    raise exception 'the rename sent % "Call allotted" notice(s)', n_now - (select n from before_notes);
  end if;
  select string_agg(ucn, ',' order by ucn) into seen from rm_sees;
  if seen is distinct from 'RR-F1,RR-F2,RR-F3' then
    raise exception 'the manager should still see RR-F1, RR-F2, RR-F3, sees %', seen;
  end if;
  select string_agg(part_code || '=' || on_hand, ',' order by part_code) into b from before_stock;
  select string_agg(part_code || '=' || on_hand, ',' order by part_code) into a
    from public.handstock_balance where engineer_key = 'eng new';
  if b is null or a is distinct from b then
    raise exception 'hand stock should be the same balance under the new name: before %, after %', b, a;
  end if;
  if exists (select 1 from public.handstock_balance where engineer_key = 'eng old' and on_hand <> 0) then
    raise exception 'a balance was left under the old name';
  end if;
  raise notice 'ok: no notice; manager sees %; stock % under the new name', seen, a;
end $$;

\echo ''
\echo '--- 4. what must not move did not ---'
do $$
declare got text;
begin
  select allocated_to into got from public.field_calls where ucn = 'RR-F3';
  if got <> 'Eng Other' then raise exception 'another engineer''s call moved: %', got; end if;
  select recorded_by into got from public.spare_consumption where ucn = 'RR-F1';
  if got <> 'Eng Old' then raise exception 'a signature column was rewritten: %', got; end if;
  if (select from_engineer from public.stock_transfers where uid = 'ST-RR2') <> 'Eng Other' then
    raise exception 'the other side of a transfer moved';
  end if;
  raise notice 'ok: other engineer and recorded_by untouched';
end $$;

\echo ''
\echo '--- 5. outside a rename the guards still refuse; no ticket is left ---'
call public.be('rr-admin@x.com');
set role authenticated;
\echo 'expect ERROR: a consumption line cannot change engineer'
update public.spare_consumption set engineer = 'Eng Other' where ucn = 'RR-F1';
\echo 'expect ERROR: an answered request is frozen'
update public.call_requests set engineer = 'Eng Other' where party_name = 'RR HOSP';
\echo 'expect ERROR: a dispatched request keeps its engineer'
update public.spare_requests set engineer = 'Eng Other' where uid = 'SRQ-RR';
reset role;
do $$
begin
  if exists (select 1 from public.engineer_rename_ticket) then
    raise exception 'a rename ticket was left behind';
  end if;
  if has_table_privilege('authenticated', 'public.engineer_rename_ticket', 'INSERT') then
    raise exception 'a signed-in user can forge a rename ticket';
  end if;
  raise notice 'ok: no ticket left, and none can be forged';
end $$;

\echo ''
\echo '--- 6. a duplicate old name moves nothing ---'
insert into public.field_calls (ucn, call_number, party_name, allocated_to) values ('RR-T1', 'CN-RRT', 'RR HOSP', 'Twin');
call public.be('rr-admin@x.com');
set role authenticated;
update public.user_directory set name = 'Twin Renamed' where email = 'tw1@x.com';
reset role;
do $$
begin
  if (select allocated_to from public.field_calls where ucn = 'RR-T1') <> 'Twin' then
    raise exception 'a call under a name two people share was moved';
  end if;
  raise notice 'ok: the shared name''s call stayed';
end $$;
