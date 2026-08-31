-- ===========================================================================
-- MRN — Material Return Note (0039_material_returns.sql).
--   A return is the fifth hand-stock movement and the second that takes stock
--   out of an engineer's hands. This suite pins that it subtracts, that an
--   engineer cannot return what they are not holding, that imported history is
--   exempt from that check, and that the numbering and immutability hold.
-- Run after _stub.sql + every migration. It shares the other suites' personas
-- and only looks at its own MR-* parts, so it can run alongside them.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','eng@x.com'),
  ('22222222-2222-2222-2222-222222222222','rm@x.com'),
  ('33333333-3333-3333-3333-333333333333','stores@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('11111111-1111-1111-1111-111111111111','eng@x.com','Eng Elan','engineer'),
  ('22222222-2222-2222-2222-222222222222','rm@x.com','RM Ravi','rm'),
  ('33333333-3333-3333-3333-333333333333','stores@x.com','Stores Sam','stores_incharge')
on conflict do nothing;

create or replace procedure public.be(p_email text) language plpgsql as $$
begin
  update public.harness set uid = (select id from auth.users where email = p_email), email = p_email;
end $$;

\echo '--- 1. Stores issues 5 of a spare to the engineer ---'
call public.be('eng@x.com');
insert into public.spare_requests (uid, engineer, engineer_email, item_status)
  values ('MR-REQ-1','Eng Elan','eng@x.com','WARRANTY');
insert into public.spare_request_lines (request_uid, row_no, part, qty)
  values ('MR-REQ-1',1,'MR-100|Return test board',5);
call public.be('rm@x.com');
update public.spare_request_lines set rm_approval='Approved', rm_by='RM Ravi', rm_at=now(),
       commercial_approval='Auto-Approved', nsm_approval='Auto-Approved' where request_uid='MR-REQ-1';
call public.be('stores@x.com');
update public.spare_request_lines set stores_status='Dispatched', dc_number='DC-MR1',
       dispatched_by='Stores Sam', dispatched_at=now() where request_uid='MR-REQ-1';
select part_code, stock_out, returned, on_hand from public.handstock_balance where part_code='MR-100';

\echo '--- 2. returning 2 takes them off the stock level ---'
call public.be('eng@x.com');
insert into public.material_returns (mrn_no, mrn_date, engineer, engineer_email, part, good_qty, defective_qty, remarks)
  values ('105', current_date, 'Eng Elan', 'eng@x.com', 'MR-100|Return test board', 2, 0, 'not needed');
select part_code, stock_out, returned, on_hand from public.handstock_balance where part_code='MR-100';

\echo '--- 3. a defective return counts too: both quantities leave the engineer ---'
insert into public.material_returns (mrn_no, mrn_date, engineer, engineer_email, part, good_qty, defective_qty)
  values ('105', current_date, 'Eng Elan', 'eng@x.com', 'MR-100|Return test board', 0, 1);
select part_code, stock_out, returned, on_hand from public.handstock_balance where part_code='MR-100';

\echo '--- 4. the movement shows up as a Return, against its MRN ---'
select direction, movement, qty, ref, ref_type, remarks
  from public.handstock_movements where part_code='MR-100' order by movement, qty;

\echo '--- 5. the MRN number is assigned, and row numbers restart per submission ---'
select uid ~ '^MRN-[0-9]{4}-[0-9]{4}$' as numbered, row_no, good_qty, defective_qty
  from public.material_returns where part = 'MR-100|Return test board' order by id;

\echo '--- 6. an engineer cannot return what they are not holding ---'
\echo 'expect ERROR: more than is in hand'
insert into public.material_returns (mrn_no, mrn_date, engineer, engineer_email, part, good_qty)
  values ('106', current_date, 'Eng Elan', 'eng@x.com', 'MR-100|Return test board', 99);
\echo 'expect ERROR: a spare nobody issued'
insert into public.material_returns (mrn_no, mrn_date, engineer, engineer_email, part, good_qty)
  values ('106', current_date, 'Eng Elan', 'eng@x.com', 'MR-999|Never issued', 1);
\echo 'expect ERROR: nothing returned at all'
insert into public.material_returns (mrn_no, mrn_date, engineer, engineer_email, part, good_qty, defective_qty)
  values ('106', current_date, 'Eng Elan', 'eng@x.com', 'MR-100|Return test board', 0, 0);

\echo '--- 7. the stock level is unchanged by the refusals ---'
select part_code, stock_out, returned, on_hand from public.handstock_balance where part_code='MR-100';

\echo '--- 8. imported history is exempt — it predates the ledger it would be checked against ---'
insert into public.material_returns (uid, row_no, mrn_no, mrn_date, engineer, part, good_qty, source)
  values ('SI4703', 1, '105', date '2022-07-12', 'Shankar', 'MR-200|Historic board', 1, 'import');
select m.uid, m.source, b.engineer, b.part_code, b.returned, b.on_hand
  from public.material_returns m
  join public.handstock_balance b on b.part_code = public.part_code(m.part)
 where m.uid = 'SI4703';

\echo '--- 9. the engineer name is matched the same way as every other movement ---'
insert into public.material_returns (mrn_no, mrn_date, engineer, engineer_email, part, good_qty)
  values ('107', current_date, '  ENG ELAN ', 'eng@x.com', 'mr-100|Return test board (reworded)', 1);
select engineer_key, part_code, stock_out, returned, on_hand
  from public.handstock_balance where part_code='MR-100';

\echo '--- 10. a return is a record, not something to edit ---'
\echo 'expect ERROR: updating a return'
update public.material_returns set good_qty = 5 where mrn_no = '105';

\echo '--- 11. engineer_stock (the transfer guard) sees the return too ---'
select public.engineer_stock_available('Eng Elan','MR-100|Return test board') as available;

\echo '--- 12. the permissions are granted ---'
select role,
       permissions ? 'stock.return' as can_return,
       permissions ? 'mod:/mrn'     as mrn_module
  from public.app_roles order by role;
