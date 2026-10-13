-- ===========================================================================
-- QUOTATIONS (0425) -- a service contract, spares, or both on one document.
--
--   1. raised whole as a signed-in editor: numbered QT/YY/0001, Prepared by
--      stamped from the session (the forged id discarded), the figures on
--      every line GENERATED -- and they are the ones src/lib/quotes.ts gives
--   2. the register view sums them, and reads under the quotations policy
--   3. the shape rules: a contract line names a serial, a cover and a period;
--      a spare line names a part; a quantity is above zero
--   4. a reader holding the page key reads and cannot write; nobody with
--      neither key sees a row
--   5. the number and Prepared by cannot be rewritten; the status is stamped
--   6. once Accepted the quotation and its lines are FROZEN; nothing deletes
--      a quotation; a second quotation is /0002 and may revise the first
--   7. the number series is not the API's to call
--
-- The writes run as `authenticated` (a superuser ignores policies and
-- grants). Run ONCE after _stub.sql + every migration. Every error printed is
-- labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('0e425000-0000-0000-0000-000000000001', 'qt-editor@x.com'),
  ('0e425000-0000-0000-0000-000000000002', 'qt-reader@x.com'),
  ('0e425000-0000-0000-0000-000000000003', 'qt-nobody@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role, active, extra_permissions) values
  ('0e425000-0000-0000-0000-000000000001', 'qt-editor@x.com', 'QT EDITOR', 'engineer', true, '["quote.edit"]'),
  ('0e425000-0000-0000-0000-000000000002', 'qt-reader@x.com', 'QT READER', 'engineer', true, '["mod:/quotations"]'),
  ('0e425000-0000-0000-0000-000000000003', 'qt-nobody@x.com', 'QT NOBODY', 'engineer', true, '[]')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name, active = excluded.active,
  extra_permissions = excluded.extra_permissions;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
create or replace procedure public.nobody() language plpgsql as $$
begin update public.harness set uid = null, email = null; end $$;
grant select on public.harness to anon, authenticated;

\echo ''
\echo '--- 1. RAISED WHOLE, NUMBERED, STAMPED, PRICED BY THE DATABASE ---'
call public.be('qt-editor@x.com');
begin; set local role authenticated;
  insert into public.quotations (party_name, subject, valid_until, prepared_by, prepared_by_name)
  values (' QT HOSPITAL ', 'AMC and spares', current_date + 30, '0e425000-0000-0000-0000-000000000003', 'FORGED');
  insert into public.quotation_lines (quote_id, row_no, line_type, description, product_name, serial_number, cover_type, period_months, period_start, period_end, qty, unit_price, discount_pct, gst_pct)
  select id, 1, 'Contract', 'ORION-G — Sl. No. QT-SN-1', 'ORION-G', 'QT-SN-1', 'amc', 12, date '2026-11-01', date '2027-10-31', 1, 10000, 0, 18
    from public.quotations where party_name = 'QT HOSPITAL';
  insert into public.quotation_lines (quote_id, row_no, line_type, description, part_code, hsn_code, qty, unit_price, discount_pct, gst_pct)
  select id, 2, 'Spare', 'FLOW SENSOR', 'qt-p1', '9018', 2, 1234.565, 10, 18
    from public.quotations where party_name = 'QT HOSPITAL';
  insert into public.quotation_lines (quote_id, row_no, line_type, description, part_code, qty, unit_price, discount_pct, gst_pct)
  select id, 3, 'Spare', 'ZERO-RATED ITEM', 'QT-P2', 3, 100, 0, 0
    from public.quotations where party_name = 'QT HOSPITAL';
commit;
select 'numbered QT/YY/0001, party trimmed, Prepared by is the session (forgery discarded)',
       quote_no = 'QT/' || to_char(now() at time zone 'Asia/Kolkata', 'YY') || '/0001'
   and party_name = 'QT HOSPITAL' and status = 'Draft'
   and prepared_by = '0e425000-0000-0000-0000-000000000001' and prepared_by_name = 'QT EDITOR'
   and status_by is null and status_at is null as ok
  from public.quotations where party_name = 'QT HOSPITAL';
-- The figures src/lib/quotes.ts gives for the same inputs (taxable rounded
-- first, GST from the rounded taxable): 10000 / 1800 / 11800;
-- 2 x 1234.565 less 10% = 2222.22, GST 400.00, total 2622.22; 300 / 0 / 300.
select 'the generated figures, cover and part code upper-cased',
       bool_and(case row_no
         when 1 then taxable_amount = 10000 and tax_amount = 1800 and total_amount = 11800 and cover_type = 'AMC'
         when 2 then taxable_amount = 2222.22 and tax_amount = 400.00 and total_amount = 2622.22 and part_code = 'QT-P1'
         when 3 then taxable_amount = 300 and tax_amount = 0 and total_amount = 300
         else false end) as ok
  from public.quotation_lines l join public.quotations q on q.id = l.quote_id where q.party_name = 'QT HOSPITAL';

\echo ''
\echo '--- 2. THE REGISTER SUMS THEM ---'
begin; set local role authenticated;
  select 'the register: one contract line, two spare lines, totals summed',
         lines = 3 and contract_lines = 1 and spare_lines = 2
     and taxable_total = 12522.22 and tax_total = 2200.00 and grand_total = 14722.22 as ok
    from public.quotation_register where party_name = 'QT HOSPITAL';
commit;

\echo ''
\echo '--- 3. THE SHAPE RULES ---'
\echo 'expect ERROR: a contract line with no serial'
begin; set local role authenticated;
  insert into public.quotation_lines (quote_id, row_no, line_type, description, cover_type, period_months, qty, unit_price)
  select id, 4, 'Contract', 'no serial', 'AMC', 12, 1, 1 from public.quotations where party_name = 'QT HOSPITAL';
commit;
\echo 'expect ERROR: a contract line with a cover that is not AMC or CMC'
begin; set local role authenticated;
  insert into public.quotation_lines (quote_id, row_no, line_type, description, serial_number, cover_type, period_months, qty, unit_price)
  select id, 4, 'Contract', 'wgp', 'QT-SN-9', 'WGP', 12, 1, 1 from public.quotations where party_name = 'QT HOSPITAL';
commit;
\echo 'expect ERROR: a contract line with no period'
begin; set local role authenticated;
  insert into public.quotation_lines (quote_id, row_no, line_type, description, serial_number, cover_type, qty, unit_price)
  select id, 4, 'Contract', 'no period', 'QT-SN-9', 'CMC', 1, 1 from public.quotations where party_name = 'QT HOSPITAL';
commit;
\echo 'expect ERROR: a spare line with no part'
begin; set local role authenticated;
  insert into public.quotation_lines (quote_id, row_no, line_type, description, qty, unit_price)
  select id, 4, 'Spare', 'no part', 1, 1 from public.quotations where party_name = 'QT HOSPITAL';
commit;
\echo 'expect ERROR: a quantity of zero'
begin; set local role authenticated;
  insert into public.quotation_lines (quote_id, row_no, line_type, description, part_code, qty, unit_price)
  select id, 4, 'Spare', 'none of it', 'QT-P3', 0, 1 from public.quotations where party_name = 'QT HOSPITAL';
commit;
\echo 'expect ERROR: Valid Until before the quotation date'
begin; set local role authenticated;
  insert into public.quotations (party_name, quote_date, valid_until) values ('QT BAD DATES', current_date, current_date - 1);
commit;
select 'still three lines, still one quotation', (select count(*) from public.quotation_lines) = 3 and (select count(*) from public.quotations) = 1 as ok;

\echo ''
\echo '--- 4. WHO READS, WHO WRITES ---'
call public.be('qt-reader@x.com');
begin; set local role authenticated;
  select 'the page key reads the quotation, its lines and the register',
         (select count(*) from public.quotations) = 1
     and (select count(*) from public.quotation_lines) = 3
     and (select count(*) from public.quotation_register) = 1 as ok;
commit;
\echo 'expect ERROR: the page key alone cannot raise a quotation'
begin; set local role authenticated;
  insert into public.quotations (party_name) values ('QT READER TRIES');
commit;
\echo 'expect ERROR: nor add a line'
begin; set local role authenticated;
  insert into public.quotation_lines (quote_id, row_no, line_type, description, part_code, qty, unit_price)
  select id, 4, 'Spare', 'reader line', 'QT-P3', 1, 1 from public.quotations where party_name = 'QT HOSPITAL';
commit;
begin; set local role authenticated;
  update public.quotations set subject = 'READER EDIT' where party_name = 'QT HOSPITAL';
commit;
select 'an UPDATE by the page key matches nothing (no error, nothing written)',
       subject = 'AMC and spares' as ok from public.quotations where party_name = 'QT HOSPITAL';
call public.be('qt-nobody@x.com');
begin; set local role authenticated;
  select 'neither key: no quotation, no line, no register row',
         (select count(*) from public.quotations) = 0
     and (select count(*) from public.quotation_lines) = 0
     and (select count(*) from public.quotation_register) = 0 as ok;
commit;

\echo ''
\echo '--- 5. THE NUMBER AND PREPARED BY ARE KEPT; THE STATUS IS STAMPED ---'
call public.be('qt-editor@x.com');
begin; set local role authenticated;
  update public.quotations set quote_no = 'FORGED', prepared_by_name = 'SOMEBODY ELSE', status = 'Sent', subject = 'AMC and spares (sent)'
   where party_name = 'QT HOSPITAL';
commit;
select 'number and Prepared by unchanged; Sent stamped by the session',
       quote_no = 'QT/' || to_char(now() at time zone 'Asia/Kolkata', 'YY') || '/0001'
   and prepared_by_name = 'QT EDITOR' and status = 'Sent' and subject = 'AMC and spares (sent)'
   and status_by = '0e425000-0000-0000-0000-000000000001' and status_at is not null as ok
  from public.quotations where party_name = 'QT HOSPITAL';
-- A Sent quotation is still open: a line may be re-priced.
begin; set local role authenticated;
  update public.quotation_lines set unit_price = 12000 where row_no = 1
    and quote_id = (select id from public.quotations where party_name = 'QT HOSPITAL');
commit;
select 'a Sent quotation is re-priced and the figures follow',
       unit_price = 12000 and taxable_amount = 12000 and tax_amount = 2160 and total_amount = 14160 as ok
  from public.quotation_lines where row_no = 1 and quote_id = (select id from public.quotations where party_name = 'QT HOSPITAL');

\echo ''
\echo '--- 6. FROZEN ONCE ACCEPTED; NEVER DELETED; REVISED INSTEAD ---'
begin; set local role authenticated;
  update public.quotations set status = 'Accepted' where party_name = 'QT HOSPITAL';
commit;
select 'Accepted', status = 'Accepted' as ok from public.quotations where party_name = 'QT HOSPITAL';
\echo 'expect ERROR: an Accepted quotation refuses a change to its header'
begin; set local role authenticated;
  update public.quotations set subject = 'changed after acceptance' where party_name = 'QT HOSPITAL';
commit;
\echo 'expect ERROR: ...and to its status'
begin; set local role authenticated;
  update public.quotations set status = 'Draft' where party_name = 'QT HOSPITAL';
commit;
\echo 'expect ERROR: ...and a re-priced line'
begin; set local role authenticated;
  update public.quotation_lines set unit_price = 1 where quote_id = (select id from public.quotations where party_name = 'QT HOSPITAL');
commit;
\echo 'expect ERROR: ...and a new line'
begin; set local role authenticated;
  insert into public.quotation_lines (quote_id, row_no, line_type, description, part_code, qty, unit_price)
  select id, 4, 'Spare', 'late line', 'QT-P3', 1, 1 from public.quotations where party_name = 'QT HOSPITAL';
commit;
\echo 'expect ERROR: ...and a removed line'
begin; set local role authenticated;
  delete from public.quotation_lines where quote_id = (select id from public.quotations where party_name = 'QT HOSPITAL');
commit;
\echo 'expect ERROR: a quotation is never deleted'
begin; set local role authenticated;
  delete from public.quotations where party_name = 'QT HOSPITAL';
commit;
select 'everything as it was: Accepted, three lines, line 1 at 12000',
       (select status from public.quotations where party_name = 'QT HOSPITAL') = 'Accepted'
   and (select count(*) from public.quotation_lines l join public.quotations q on q.id = l.quote_id where q.party_name = 'QT HOSPITAL') = 3
   and (select unit_price from public.quotation_lines l join public.quotations q on q.id = l.quote_id where q.party_name = 'QT HOSPITAL' and l.row_no = 1) = 12000 as ok;
-- Revise: a new Draft naming the original (the screen copies the lines).
begin; set local role authenticated;
  insert into public.quotations (party_name, subject, revision_of)
  select party_name, subject, quote_no from public.quotations where party_name = 'QT HOSPITAL';
commit;
select 'the revision is QT/YY/0002, a Draft, naming /0001',
       quote_no = 'QT/' || to_char(now() at time zone 'Asia/Kolkata', 'YY') || '/0002'
   and status = 'Draft' and revision_of = 'QT/' || to_char(now() at time zone 'Asia/Kolkata', 'YY') || '/0001' as ok
  from public.quotations where revision_of <> '';

\echo ''
\echo '--- 7. THE NUMBER SERIES IS NOT THE API''S TO CALL ---'
\echo 'expect ERROR: anon cannot call quote_next_no()'
begin; set local role anon;
  select public.quote_next_no(now());
commit;
\echo 'expect ERROR: nor can a signed-in user'
begin; set local role authenticated;
  select public.quote_next_no(now());
commit;
select 'still two quotations', (select count(*) from public.quotations) = 2 as ok;
call public.nobody();
