-- ===========================================================================
-- THE USER'S DECISIONS OF 2026-10-05, PROVED ON A DATABASE (0374-0376).
-- Each section proves BOTH halves: what the decision refuses is refused, AND
-- the honest path beside it still works.
--
--   1. D-033  a field call is registered with its vigilance questions answered (0374)
--   2. D-049  stock moves from your own or your team's hand stock, to a User Master name (0375)
--   3. D-129  review answers are read by holders of review.view (0376)
--
-- D-104 (Renew / Convert held to the contract form's required fields) is a
-- screen rule and is proved by check:ui.
-- Checks raise an unlabelled error when they are wrong, so the harness counts
-- a failure; an error that is meant to happen is labelled `expect ERROR`.
-- Run ONCE after _stub.sql + every migration.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.app_roles (role, label, permissions) values
 ('dd_hotline', 'DD Hotline', '["calls.view", "calls.create", "data.view_all"]'::jsonb),
 ('dd_loader',  'DD Loader',  '["calls.view", "calls.create", "bulk.upload", "stock.transfer"]'::jsonb),
 ('dd_eng',     'DD Engineer','["calls.view", "stock.transfer"]'::jsonb),
 ('dd_store',   'DD Stores',  '["calls.view", "stock.transfer", "stock.transfer.others"]'::jsonb),
 ('dd_editor',  'DD Editor',  '["calls.view", "data.view_all", "review.edit"]'::jsonb),
 ('dd_reader',  'DD Reader',  '["calls.view", "data.view_all", "review.view"]'::jsonb),
 ('dd_other',   'DD Other',   '["calls.view", "data.view_all"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;

insert into auth.users (id, email) values
  ('0dd00000-0000-0000-0000-000000000001', 'dd-hotline@x.com'),
  ('0dd00000-0000-0000-0000-000000000002', 'dd-loader@x.com'),
  ('0dd00000-0000-0000-0000-000000000003', 'dd-mgr@x.com'),
  ('0dd00000-0000-0000-0000-000000000004', 'dd-store@x.com'),
  ('0dd00000-0000-0000-0000-000000000005', 'dd-editor@x.com'),
  ('0dd00000-0000-0000-0000-000000000006', 'dd-reader@x.com'),
  ('0dd00000-0000-0000-0000-000000000007', 'dd-other@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0dd00000-0000-0000-0000-000000000001', 'dd-hotline@x.com', 'DD Hotline', 'dd_hotline'),
  ('0dd00000-0000-0000-0000-000000000002', 'dd-loader@x.com',  'DD Loader',  'dd_loader'),
  ('0dd00000-0000-0000-0000-000000000003', 'dd-mgr@x.com',     'DD Manager', 'dd_eng'),
  ('0dd00000-0000-0000-0000-000000000004', 'dd-store@x.com',   'DD Store',   'dd_store'),
  ('0dd00000-0000-0000-0000-000000000005', 'dd-editor@x.com',  'DD Editor',  'dd_editor'),
  ('0dd00000-0000-0000-0000-000000000006', 'dd-reader@x.com',  'DD Reader',  'dd_reader'),
  ('0dd00000-0000-0000-0000-000000000007', 'dd-other@x.com',   'DD Other',   'dd_other')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

delete from public.user_directory where name like 'DD %';
insert into public.user_directory (name, email, reporting_manager) values
  ('DD Manager', 'dd-mgr@x.com', ''),
  ('DD Ajay',    'dd-ajay@x.com', 'DD Manager'),
  ('DD Stranger','dd-stranger@x.com', 'DD Elsewhere'),
  ('DD Store',   'dd-store@x.com', '');

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
create or replace procedure public.nobody() language plpgsql as $$
begin update public.harness set uid = null, email = null; end $$;
grant select on public.harness to authenticated;

-- ===========================================================================
\echo ''
\echo '--- 1. D-033: the vigilance questions are answered at registration ---'
-- ===========================================================================
call public.nobody();
delete from public.field_calls where party_name = 'DD HOSP';
call public.be('dd-hotline@x.com');
set role authenticated;
\echo 'expect ERROR: Answer the vigilance questions before registering the call: Public Health Threat?, Death?, Serious Incident?'
insert into public.calls (call_type, party_name, product_name, serial, complaint_reported)
values ('FIELD', 'DD HOSP', 'DD VENT', 'DD-1', 'no power');
\echo 'expect ERROR: Answer the vigilance questions before registering the call: Death?'
insert into public.calls (call_type, party_name, product_name, serial, complaint_reported, public_health_threat, death, serious_incident)
values ('FIELD', 'DD HOSP', 'DD VENT', 'DD-2', 'no power', 'NO', '', 'NO');
insert into public.calls (call_type, party_name, product_name, serial, complaint_reported, public_health_threat, death, serious_incident)
values ('FIELD', 'DD HOSP', 'DD VENT', 'DD-3', 'no power', 'NO', 'NO', 'YES');
reset role;
-- An import loads history as it was.
call public.be('dd-loader@x.com');
set role authenticated;
insert into public.calls (call_type, party_name, product_name, serial, complaint_reported)
values ('FIELD', 'DD HOSP', 'DD VENT', 'DD-4', 'old call');
reset role;
call public.nobody();
do $$ begin
  if (select string_agg(serial, ',' order by serial) from public.field_calls where party_name = 'DD HOSP')
     is distinct from 'DD-3,DD-4' then
    raise exception 'D-033 FAILED: got %', (select string_agg(serial, ',' order by serial) from public.field_calls where party_name = 'DD HOSP');
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 2. D-049: whose stock may be transferred, and to whom ---'
-- ===========================================================================
call public.nobody();
delete from public.stock_transfers where uid like 'DD-ST%';
call public.be('dd-mgr@x.com');
set role authenticated;
insert into public.stock_transfers (uid, from_engineer, to_engineer, transfer_date) values ('DD-ST1', 'DD Manager', 'DD Ajay', current_date);
insert into public.stock_transfers (uid, from_engineer, to_engineer, transfer_date) values ('DD-ST2', 'dd ajay ', 'DD Manager', current_date);
\echo 'expect ERROR: DD Stranger is not you or an engineer in your team, so their stock cannot be transferred by you'
insert into public.stock_transfers (uid, from_engineer, to_engineer, transfer_date) values ('DD-ST3', 'DD Stranger', 'DD Ajay', current_date);
\echo 'expect ERROR: NOBODY AT ALL is not a person on the User Master'
insert into public.stock_transfers (uid, from_engineer, to_engineer, transfer_date) values ('DD-ST4', 'DD Manager', 'NOBODY AT ALL', current_date);
reset role;
call public.be('dd-store@x.com');
set role authenticated;
insert into public.stock_transfers (uid, from_engineer, to_engineer, transfer_date) values ('DD-ST5', 'DD Stranger', 'DD Ajay', current_date);
reset role;
call public.be('dd-loader@x.com');
set role authenticated;
insert into public.stock_transfers (uid, from_engineer, to_engineer, transfer_date) values ('DD-ST6', 'DD Stranger', 'SOMEBODY IN THE OLD FILE', current_date);
reset role;
call public.nobody();
do $$ begin
  if (select string_agg(uid, ',' order by uid) from public.stock_transfers where uid like 'DD-ST%')
     is distinct from 'DD-ST1,DD-ST2,DD-ST5,DD-ST6' then
    raise exception 'D-049 FAILED: got %', (select string_agg(uid, ',' order by uid) from public.stock_transfers where uid like 'DD-ST%');
  end if;
  if exists (select 1 from public.app_roles where permissions ? 'stock.transfer.others' and role not like 'dd_%') then
    raise exception 'D-049 FAILED: stock.transfer.others was given to a role -- it is ticked per role or person';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 3. D-129: review answers are read by holders of review.view ---'
-- ===========================================================================
call public.nobody();
insert into public.call_reviews (ucn) select ucn from public.field_calls where serial = 'DD-3'
on conflict (ucn) do nothing;
create temp table dd_seen (who text, n bigint);
grant all on dd_seen to authenticated;
call public.be('dd-editor@x.com');
set role authenticated;
insert into dd_seen select 'editor', count(*) from public.call_reviews r join public.field_calls c on c.ucn = r.ucn where c.serial = 'DD-3';
reset role;
call public.be('dd-reader@x.com');
set role authenticated;
insert into dd_seen select 'reader', count(*) from public.call_reviews r join public.field_calls c on c.ucn = r.ucn where c.serial = 'DD-3';
reset role;
call public.be('dd-other@x.com');
set role authenticated;
insert into dd_seen select 'other', count(*) from public.call_reviews r join public.field_calls c on c.ucn = r.ucn where c.serial = 'DD-3';
reset role;
call public.nobody();
\echo 'expect: editor 1 | reader 1 | other 0'
select who, n from dd_seen order by who;
do $$ begin
  if (select string_agg(who || '=' || n, ',' order by who) from dd_seen) is distinct from 'editor=1,other=0,reader=1' then
    raise exception 'D-129 FAILED: got %', (select string_agg(who || '=' || n, ',' order by who) from dd_seen);
  end if;
  if not exists (select 1 from public.perm_parents where child = 'review.view' and parent = 'review.edit') then
    raise exception 'D-129 FAILED: review.edit does not grant review.view';
  end if;
end $$;

call public.nobody();
