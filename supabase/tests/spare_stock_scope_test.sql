-- ===========================================================================
-- Hand Stock / Stock Transfer / Material Returns follow the reporting tree
-- (0041_stock_read_scope.sql, with 0038 / 0039 / 0040).
--   A manager sees their own and their engineers' stock — nobody else's.
--   The office desks, which move stock for every team, still see it all.
-- Superuser bypasses RLS, so each check runs as `authenticated` in its own
-- block. Run after _stub.sql + every migration.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id,email) values
 ('22222222-2222-2222-2222-222222222222','harsha@x.com'),
 ('44444444-4444-4444-4444-444444444444','anil@x.com'),
 ('66666666-6666-6666-6666-666666666666','zara@x.com'),
 ('55555555-5555-5555-5555-555555555555','stores@x.com');
insert into public.profiles (id,email,full_name,role) values
 ('22222222-2222-2222-2222-222222222222','harsha@x.com','Harsha','rm'),
 ('44444444-4444-4444-4444-444444444444','anil@x.com','Anil','engineer'),
 ('66666666-6666-6666-6666-666666666666','zara@x.com','Zara','engineer'),
 ('55555555-5555-5555-5555-555555555555','stores@x.com','Stores Sam','stores_incharge');
-- Anil reports to Harsha. Zara reports to someone else entirely.
insert into public.user_directory (name, email, reporting_manager) values
 ('Harsha','harsha@x.com',''),
 ('Anil','anil@x.com','Harsha'),
 ('Other Mgr','other@x.com',''),
 ('Zara','zara@x.com','Other Mgr');
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid=(select id from auth.users where email=p), email=p; end $$;

-- Hand stock for both engineers: a dispatched spare is stock in their hands.
insert into public.spare_requests (uid, engineer, engineer_email, req_type, item_status) values
 ('H1','Anil','anil@x.com','HandStock','WARRANTY'),
 ('H2','Zara','zara@x.com','HandStock','WARRANTY');
insert into public.spare_request_lines (request_uid, part, qty) values
 ('H1','P-A|Pump',5),('H2','P-B|Valve',7);
update public.spare_request_lines
   set rm_approval='Approved', commercial_approval='Auto-Approved', nsm_approval='Auto-Approved',
       stores_status='Dispatched', dc_number='SO-TEST', dispatched_at=now();
-- A transfer and a return on each side of the tree.
insert into public.stock_transfers (uid, from_engineer, to_engineer) values
 ('ST-A','Anil','Harsha'), ('ST-Z','Zara','Other Mgr');
insert into public.stock_transfer_lines (transfer_uid, part, qty) values ('ST-A','P-A|Pump',1);
insert into public.material_returns (uid, engineer, engineer_email, part, good_qty) values
 ('MR-A','Anil','anil@x.com','P-A|Pump',1),
 ('MR-Z','Zara','zara@x.com','P-B|Valve',1);

grant select on public.harness to authenticated;
grant select on public.stock_transfers, public.stock_transfer_lines,
                public.material_returns, public.spare_requests,
                public.spare_request_lines, public.spare_consumption,
                public.handstock_balance, public.handstock_movements,
                public.engineer_stock to authenticated;

\echo '--- 1. Harsha: hand stock is his team only ---'
call public.be('harsha@x.com');
do $$
declare seen text;
begin
  set local role authenticated;
  select string_agg(engineer || '=' || on_hand, ', ' order by engineer) into seen
    from public.handstock_balance;
  raise notice 'Hand Stock -> %', coalesce(seen, '(nothing)');
  if seen is not null and seen like '%Zara%' then
    raise exception 'LEAK: Zara''s hand stock is visible to Harsha';
  end if;
end $$;

\echo '--- 2. Harsha: the derived stock view, which used to bypass RLS ---'
do $$
declare seen text;
begin
  set local role authenticated;
  select string_agg(engineer || '=' || qty, ', ' order by engineer) into seen
    from public.engineer_stock;
  raise notice 'engineer_stock -> %', coalesce(seen, '(nothing)');
  if seen is not null and seen like '%zara%' then
    raise exception 'LEAK: Zara''s stock level is visible to Harsha';
  end if;
end $$;

\echo '--- 3. Harsha: transfers and returns, his team only ---'
do $$
declare t text; m text;
begin
  set local role authenticated;
  select string_agg(uid, ', ' order by uid) into t from public.stock_transfers;
  select string_agg(uid, ', ' order by uid) into m from public.material_returns;
  raise notice 'Transfers -> %   Returns -> %', coalesce(t,'(none)'), coalesce(m,'(none)');
  if coalesce(t,'') like '%ST-Z%' then raise exception 'LEAK: another team''s transfer'; end if;
  if coalesce(m,'') like '%MR-Z%' then raise exception 'LEAK: another team''s return'; end if;
end $$;

\echo '--- 4. Stores still sees every team''s stock, transfers and returns ---'
call public.be('stores@x.com');
do $$
declare a int; b int; c int;
begin
  set local role authenticated;
  select count(*) into a from public.handstock_balance;
  select count(*) into b from public.stock_transfers;
  select count(*) into c from public.material_returns;
  raise notice 'Stores sees % stock line(s), % transfer(s), % return(s)', a, b, c;
  if a < 2 or b < 2 or c < 2 then
    raise exception 'Stores lost sight of stock it has to move';
  end if;
end $$;

\echo '--- 5. the overdraw guard still sees every movement (definer rights) ---'
select public.engineer_stock_available('Zara','P-B|Valve') as zara_valves_seen_by_the_guard;
