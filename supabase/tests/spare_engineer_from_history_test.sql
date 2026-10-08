-- ===========================================================================
-- A SPARE REQUEST WITH NO ENGINEER TAKES THE ONE ITS STOCK OUT NAMES (0405).
--
--   A blank request whose Stock Out history names one engineer gets that
--   engineer (and their login's email), with an engineer-change log row
--   saying why, and the hand stock then credits that engineer; a blank
--   request whose lines name two engineers is left blank; a request that
--   names an engineer is never touched; a second run changes nothing; and
--   the engineer guard still refuses an ordinary change afterwards.
--
-- The fix runs at build time, before these fixtures exist, so it is run again
-- here on them. Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
 ('e1e1e405-0000-0000-0000-000000000001', 'eng_alpha@x.com'),
 ('e1e1e405-0000-0000-0000-000000000002', 'plain_user@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
 ('e1e1e405-0000-0000-0000-000000000001', 'eng_alpha@x.com', 'ENG ALPHA', 'engineer'),
 ('e1e1e405-0000-0000-0000-000000000002', 'plain_user@x.com', 'PLAIN USER', 'engineer')
on conflict (id) do update set full_name = excluded.full_name;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;

-- Loaded as an import (no session), the way the requests came in.
update public.harness set uid = null, email = null;
insert into public.spare_requests (uid, or_no, req_type, engineer, engineer_email, item_status, dispatched_at) values
 ('SRQ-405A', 'OR405A', 'Call Based', '',          '', 'CMC', now()),
 ('SRQ-405B', 'OR405B', 'Call Based', '',          '', 'CMC', now()),
 ('SRQ-405C', 'OR405C', 'Call Based', 'ENG GAMMA', '', 'CMC', now());
insert into public.spare_request_lines (request_uid, line_uid, part, qty, dispatched_qty, stores_status) values
 ('SRQ-405A', 'OR405A|P-405', 'P-405|THING', 1, 1, 'Dispatched'),
 ('SRQ-405B', 'OR405B|P-405', 'P-405|THING', 1, 1, 'Dispatched'),
 ('SRQ-405B', 'OR405B|Q-405', 'Q-405|OTHER', 1, 1, 'Dispatched'),
 ('SRQ-405C', 'OR405C|P-405', 'P-405|THING', 1, 1, 'Dispatched');
insert into public.spare_issue_history (engineer, part, qty, so_no, line_uid, source, ref, issued_at) values
 ('ENG ALPHA', 'P-405|THING', 1, 'SO405A',  'OR405A|P-405', 'test', 'R405A',  now()),
 ('ENG ALPHA', 'P-405|THING', 1, 'SO405B1', 'OR405B|P-405', 'test', 'R405B1', now()),
 ('ENG BETA',  'Q-405|OTHER', 1, 'SO405B2', 'OR405B|Q-405', 'test', 'R405B2', now()),
 ('ENG ALPHA', 'P-405|THING', 1, 'SO405C',  'OR405C|P-405', 'test', 'R405C',  now());

select 'before: OR405A''s stock out reaches nobody -- ENG ALPHA has no P-405 stock out' as t,
       not exists (select 1 from public.handstock_movements
                    where engineer_key = public.handstock_key('ENG ALPHA') and part_code = 'P-405' and movement = 'Stock out'
                      and ref_uid = 'SRQ-405A') as ok;

\i supabase/migrations/0405_spare_request_engineer_from_history.sql

select 'OR405A takes ENG ALPHA from its Stock Out, with the login''s email' as t,
       (select engineer = 'ENG ALPHA' and engineer_email = 'eng_alpha@x.com' from public.spare_requests where uid = 'SRQ-405A') as ok;
select 'the change is on the engineer-change log, saying where the name came from' as t,
       (select count(*) = 1 from public.spare_request_engineer_log
         where request_uid = 'SRQ-405A' and from_engineer = '' and to_engineer = 'ENG ALPHA'
           and reason like '0405 data fix:%SO405A%') as ok;
select 'after: ENG ALPHA''s hand stock has the P-405 stock out' as t,
       exists (select 1 from public.handstock_movements
                where engineer_key = public.handstock_key('ENG ALPHA') and part_code = 'P-405' and movement = 'Stock out'
                  and ref_uid = 'SRQ-405A') as ok;
select 'OR405B is left blank -- its lines name two engineers' as t,
       (select btrim(engineer) = '' from public.spare_requests where uid = 'SRQ-405B')
   and not exists (select 1 from public.spare_request_engineer_log where request_uid = 'SRQ-405B') as ok;
select 'OR405C keeps the engineer it names, whatever the history says' as t,
       (select engineer = 'ENG GAMMA' from public.spare_requests where uid = 'SRQ-405C')
   and not exists (select 1 from public.spare_request_engineer_log where request_uid = 'SRQ-405C') as ok;

\i supabase/migrations/0405_spare_request_engineer_from_history.sql
select 'a second run changes nothing' as t,
       (select count(*) = 1 from public.spare_request_engineer_log where request_uid = 'SRQ-405A') as ok;

-- The flag is gone: an ordinary change by a signed-in user is still refused.
call public.be('plain_user@x.com');
\echo '-- expect ERROR: the engineer on a dispatched request cannot be changed by a plain update'
update public.spare_requests set engineer = 'SOMEBODY' where uid = 'SRQ-405A';
select 'and it was not changed' as t,
       (select engineer = 'ENG ALPHA' from public.spare_requests where uid = 'SRQ-405A') as ok;
