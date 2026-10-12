-- ===========================================================================
-- AN INSTALLATION CALL REGISTERS THE PENDING INSTALLATION REQUESTS FOR ITS
-- MACHINE (0406).
--
--   A new installation call gives its UCN to every PENDING INSTALLATION request
--   for the same product + serial (case and spaces aside), marks it
--   Registered and says who; a Field request on the same machine, a request
--   for another serial, a cancelled request and a cancelled call are left
--   alone; the one-time pass registers requests already pending for a machine
--   that already has an installation call; nobody can call the function.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values ('e1e1e406-0000-0000-0000-000000000001', 'desk406@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
 ('e1e1e406-0000-0000-0000-000000000001', 'desk406@x.com', 'DESK 406', 'hotline')
on conflict (id) do update set full_name = excluded.full_name;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

insert into public.call_requests (reqid, email, engineer, call_type, product, serial_no, party_name, status) values
 ('R940601', 'e@x.com', 'ENG', 'INSTALLATION',      'ORION-G',   'S406-1',  'P', 'Pending'),
 ('R940602', 'e@x.com', 'ENG', 'FIELD',             'ORION-G',   'S406-1',  'P', 'Pending'),
 ('R940603', 'e@x.com', 'ENG', 'INSTALLATION',      'ORION-G',   'S406-2',  'P', 'Pending'),
 ('R940605', 'e@x.com', 'ENG', 'Installation Call', ' orion-g ', 's406-1 ', 'P', ''),
 ('R940609', 'e@x.com', 'ENG', 'INSTALLATION',      'VEGA',      'S406-9',  'P', 'Pending');
insert into public.call_requests (reqid, email, engineer, call_type, product, serial_no, party_name, status, cancel_reason, cancelled_at) values
 ('R940604', 'e@x.com', 'ENG', 'INSTALLATION', 'ORION-G', 'S406-1', 'P', 'Cancelled', 'test', now());

call public.be('desk406@x.com');
insert into public.installation_calls (ucn, call_number, call_type, reg_date, product_name, serial, party_name, created_by)
values ('IC406-1', 'IC4061', 'INSTALLATION', current_date, 'ORION-G', 'S406-1', 'P', null);
insert into public.installation_calls (ucn, call_number, call_type, reg_date, product_name, serial, party_name, created_by, cancelled_at, cancel_reason)
values ('IC406-9', 'IC4069', 'INSTALLATION', current_date, 'VEGA', 'S406-9', 'P', null, now(), 'test');

select 'the pending installation request takes the call''s UCN and is Registered, actioned by the creator' as t,
       (select ucn = 'IC406-1' and status = 'Registered' and actioned_by = 'DESK 406' and actioned_at is not null
          from public.call_requests where reqid = 'R940601') as ok;
select '...and so does one spelt differently (case and spaces aside), status blank' as t,
       (select ucn = 'IC406-1' and status = 'Registered' from public.call_requests where reqid = 'R940605') as ok;
select 'a FIELD request on the same machine stays pending' as t,
       (select coalesce(ucn, '') = '' and status = 'Pending' from public.call_requests where reqid = 'R940602') as ok;
select 'a request for another serial stays pending' as t,
       (select coalesce(ucn, '') = '' and status = 'Pending' from public.call_requests where reqid = 'R940603') as ok;
select 'a cancelled request stays cancelled, with no UCN' as t,
       (select coalesce(ucn, '') = '' and status = 'Cancelled' from public.call_requests where reqid = 'R940604') as ok;
select 'a CANCELLED installation call registers nothing' as t,
       (select coalesce(ucn, '') = '' and status = 'Pending' from public.call_requests where reqid = 'R940609') as ok;

-- The one-time pass: a request raised after its machine's installation call.
insert into public.installation_calls (ucn, call_number, call_type, reg_date, product_name, serial, party_name, created_by)
values ('IC406-7', 'IC4067', 'INSTALLATION', current_date, 'MONNAL', 'S406-7', 'P', null);
insert into public.call_requests (reqid, email, engineer, call_type, product, serial_no, party_name, status) values
 ('R940607', 'e@x.com', 'ENG', 'INSTALLATION', 'MONNAL', 'S406-7', 'P', 'Pending');
select 'before the pass, a request raised after the call is still pending' as t,
       (select coalesce(ucn, '') = '' from public.call_requests where reqid = 'R940607') as ok;
\i supabase/migrations/0406_install_call_registers_requests.sql
select 'the one-time pass registers it against the machine''s installation call' as t,
       (select ucn = 'IC406-7' and status = 'Registered' and actioned_by like 'Data fix 0406%'
          from public.call_requests where reqid = 'R940607') as ok;
select '...and leaves the Field request pending' as t,
       (select coalesce(ucn, '') = '' from public.call_requests where reqid = 'R940602') as ok;

reset role;
select 'nobody can call the trigger function' as t,
       not has_function_privilege('authenticated', 'public.install_call_registers_requests()', 'execute')
   and not has_function_privilege('anon', 'public.install_call_registers_requests()', 'execute') as ok;
