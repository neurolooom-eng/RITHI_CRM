-- ===========================================================================
-- MRN — Material Return Note.
--
-- The engineer sends a spare back to Stores. It is the fifth movement of hand
-- stock and the second one that takes stock OUT of the engineer's hands:
--
--   Stock Level = Stock Out (Stores) − Consumption
--               − Transfer From + Transfer To
--               − Returned (MRN)
--
-- Shape: the sheet kept this in two tabs — a form-data tab (one row per
-- submission: SI number, MRN No, MRN Date, engineer) and a register tab (one
-- row per item, repeating the header). That is flattened here into ONE table,
-- one row per returned item, carrying its own MRN header fields, grouped by
-- `uid` so a submission returning five spares is five rows sharing one uid.
--
-- An engineer may only return what they are holding: the quantity is capped in
-- the form and enforced here, so no route can drive a hand-stock level
-- negative through a return.
-- ===========================================================================

create table if not exists public.material_returns (
  id              bigint generated always as identity primary key,
  uid             text not null,              -- one submission: MRN-YYMM-NNNN (or the sheet's SI number)
  row_no          int,                        -- the item's position within the submission
  mrn_no          text default '',            -- the physical MRN slip number the engineer writes
  mrn_date        date,                       -- the date on that slip
  engineer        text not null default '',
  engineer_email  text default '',
  part            text not null default '',   -- CODE|Description, as everywhere else
  item_code       text default '',            -- kept as its own column: the sheet exports it separately
  item_name       text default '',
  good_qty        numeric not null default 0,
  defective_qty   numeric not null default 0,
  -- The rest of the sheet's form fields. All 'NA' in the history, but the form
  -- asks for them, so they keep their place rather than being dropped.
  customer_name   text default '',
  report_no       text default '',
  removed_from_equipment text default '',
  handstock_note  text default '',
  remarks         text default '',
  source          text default 'app',         -- 'app' | 'import'
  returned_at     timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) default auth.uid(),
  constraint material_returns_qty_positive check (coalesce(good_qty, 0) + coalesce(defective_qty, 0) > 0)
);

create index if not exists material_returns_uid_idx      on public.material_returns (uid);
create index if not exists material_returns_engineer_idx on public.material_returns (lower(btrim(engineer)));
create index if not exists material_returns_date_idx     on public.material_returns (mrn_date desc nulls last);
-- The import re-runs; one row per (submission, item) is the natural identity.
create unique index if not exists material_returns_uid_part_idx
  on public.material_returns (uid, public.part_code(part), coalesce(row_no, 0));

-- ---------------------------------------------------------------------------
-- MRN numbers follow the OR / ST convention: MRN-YYMM-NNNN, restarting each
-- month. The sheet's own SI numbers are kept as-is on imported rows.
-- ---------------------------------------------------------------------------
create table if not exists public.material_return_counters (
  period  text primary key,          -- 'YY/MM'
  last_no integer not null default 0
);
alter table public.material_return_counters enable row level security;  -- definer-only

create or replace function public.next_mrn_uid(p_on date default current_date)
returns text language plpgsql security definer set search_path = public as $$
declare p text := to_char(p_on, 'YY/MM'); n integer;
begin
  insert into public.material_return_counters (period, last_no) values (p, 1)
  on conflict (period) do update set last_no = public.material_return_counters.last_no + 1
  returning last_no into n;
  return 'MRN-' || to_char(p_on, 'YYMM') || '-' || lpad(n::text, 4, '0');
end $$;
grant execute on function public.next_mrn_uid(date) to authenticated;

-- Row numbers restart at 1 within a submission, as they do on a spare request.
create or replace function public.material_returns_assign_row_no()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.uid is null or btrim(new.uid) = '' then
    new.uid := public.next_mrn_uid(coalesce(new.mrn_date, current_date));
  end if;
  if new.row_no is null then
    select coalesce(max(row_no), 0) + 1 into n from public.material_returns where uid = new.uid;
    new.row_no := n;
  end if;
  -- The item code and the catalogue string are two views of one thing; fill
  -- whichever the caller left empty rather than letting them drift apart.
  if btrim(coalesce(new.item_code, '')) = '' then new.item_code := public.part_code(new.part); end if;
  if btrim(coalesce(new.part, '')) = '' and btrim(coalesce(new.item_code, '')) <> '' then
    new.part := btrim(new.item_code) || '|' || coalesce(new.item_name, '');
  end if;
  return new;
end $$;

drop trigger if exists material_returns_assign_row_no on public.material_returns;
create trigger material_returns_assign_row_no
  before insert on public.material_returns
  for each row execute function public.material_returns_assign_row_no();

-- ---------------------------------------------------------------------------
-- A return is a record of something that happened. Correcting one means
-- another entry, not an edit; only an admin may amend.
-- ---------------------------------------------------------------------------
create or replace function public.material_returns_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  raise exception 'A material return cannot be edited — raise a correcting entry instead';
end $$;

drop trigger if exists material_returns_immutable on public.material_returns;
create trigger material_returns_immutable
  before update on public.material_returns
  for each row execute function public.material_returns_immutable();

alter table public.material_returns enable row level security;

-- Reading follows the reporting tree, as the call, spare and transfer
-- registers do.
drop policy if exists mr_read on public.material_returns;
create policy mr_read on public.material_returns for select
  using (
    public.is_admin()
    or created_by = auth.uid()
    or lower(coalesce(engineer_email, '')) = lower(auth.email())
    or public.can_approve_spares()
    or lower(btrim(engineer)) in (select lower(btrim(n)) from public.visible_engineer_names() as v(n))
  );

-- Raising one needs stock.return, and an engineer may only return their own
-- stock (anyone who may act for others — admin, Stores, an approver — can
-- record one on their behalf).
drop policy if exists mr_insert on public.material_returns;
create policy mr_insert on public.material_returns for insert
  with check (
    public.has_perm('stock.return')
    and (public.is_admin()
         or public.can_approve_spares()
         or lower(coalesce(engineer_email, '')) = lower(auth.email()))
  );

drop policy if exists mr_delete on public.material_returns;
create policy mr_delete on public.material_returns for delete using (public.is_admin());

grant select, insert on public.material_returns to authenticated;

-- ---------------------------------------------------------------------------
-- Hand stock: the fifth movement.
--
-- Both quantities leave the engineer's hands — a defective spare is on its way
-- back to Stores just as a good one is — so the movement is good + defective.
-- ---------------------------------------------------------------------------
create or replace view public.handstock_movements as
-- 1. Stock out from Stores (+)
select
  'IN'::text                                        as direction,
  'Stock out'::text                                 as movement,
  public.handstock_key(r.engineer)                  as engineer_key,
  coalesce(r.engineer, '')                          as engineer,
  coalesce(r.engineer_email, '')                    as engineer_email,
  public.part_code(l.part)                          as part_code,
  coalesce(l.part, '')                              as part,
  coalesce(l.qty, 0)                                as qty,
  coalesce(l.dispatched_at, r.dispatched_at, l.created_at, r.created_at)
                                                    as moved_at,
  coalesce(nullif(l.dc_number, ''), r.or_no, '')    as ref,
  'Stores DC'::text                                 as ref_type,
  coalesce(r.uid, '')                               as ref_uid,
  coalesce(r.ucn, '')                               as ucn,
  coalesce(r.call_number, '')                       as call_number,
  coalesce(r.party_name, '')                        as party_name,
  coalesce(nullif(l.dispatch_remarks, ''), '')      as remarks
from public.spare_request_lines l
join public.spare_requests r on r.uid = l.request_uid
where coalesce(l.stores_status, '') ~* 'dispatch'
union all
-- 2. Consumption on a call (−)
select
  'OUT'::text, 'Consumption'::text,
  public.handstock_key(c.engineer),
  coalesce(c.engineer, ''),
  coalesce(c.engineer_email, ''),
  public.part_code(c.part),
  coalesce(c.part, ''),
  coalesce(c.qty, 0),
  c.created_at,
  coalesce(nullif(btrim(c.call_number), ''), coalesce(c.ucn, '')),
  'Call'::text,
  ''::text,
  coalesce(c.ucn, ''),
  coalesce(c.call_number, ''),
  ''::text,
  ''::text
from public.spare_consumption c
union all
-- 3. Stock transfer FROM this engineer (−)
select
  'OUT'::text, 'Transfer out'::text,
  public.handstock_key(t.from_engineer),
  coalesce(t.from_engineer, ''),
  ''::text,
  public.part_code(l.part),
  coalesce(l.part, ''),
  coalesce(l.qty, 0),
  coalesce(t.transfer_date::timestamptz, t.created_at),
  coalesce(t.uid, ''),
  'Transfer'::text,
  ''::text,
  ''::text,
  ''::text,
  coalesce(t.to_engineer, ''),                      -- who it went to
  coalesce(t.remarks, '')
from public.stock_transfer_lines l
join public.stock_transfers t on t.uid = l.transfer_uid
union all
-- 4. Stock transfer TO this engineer (+)
select
  'IN'::text, 'Transfer in'::text,
  public.handstock_key(t.to_engineer),
  coalesce(t.to_engineer, ''),
  ''::text,
  public.part_code(l.part),
  coalesce(l.part, ''),
  coalesce(l.qty, 0),
  coalesce(t.transfer_date::timestamptz, t.created_at),
  coalesce(t.uid, ''),
  'Transfer'::text,
  ''::text,
  ''::text,
  ''::text,
  coalesce(t.from_engineer, ''),                    -- who it came from
  coalesce(t.remarks, '')
from public.stock_transfer_lines l
join public.stock_transfers t on t.uid = l.transfer_uid
union all
-- 5. Returned to Stores on an MRN (−)
select
  'OUT'::text, 'Return'::text,
  public.handstock_key(m.engineer),
  coalesce(m.engineer, ''),
  coalesce(m.engineer_email, ''),
  public.part_code(m.part),
  coalesce(m.part, ''),
  coalesce(m.good_qty, 0) + coalesce(m.defective_qty, 0),
  coalesce(m.mrn_date::timestamptz, m.returned_at, m.created_at),
  coalesce(nullif(btrim(m.mrn_no), ''), m.uid, ''),
  'MRN'::text,
  coalesce(m.uid, ''),
  ''::text,
  coalesce(m.report_no, ''),
  coalesce(m.customer_name, ''),
  btrim(
    case when coalesce(m.defective_qty, 0) > 0
         then 'good ' || coalesce(m.good_qty, 0) || ', defective ' || m.defective_qty || ' · ' else '' end
    || coalesce(m.remarks, '')
  )
from public.material_returns m;

-- ---------------------------------------------------------------------------
-- The balance gains its own column for what has been returned, so the level
-- stays arguable term by term.
--
-- `create or replace view` cannot insert a column in the middle of an existing
-- view, so the balance and the view over it are dropped and rebuilt. Both are
-- derived — there is nothing in them to lose.
-- ---------------------------------------------------------------------------
drop view if exists public.engineer_stock;
drop view if exists public.handstock_balance;

create view public.handstock_balance as
select
  m.engineer_key,
  max(m.engineer)                                                       as engineer,
  max(m.engineer_email)                                                 as engineer_email,
  m.part_code,
  coalesce(max(m.part) filter (where m.movement = 'Stock out'), max(m.part))
                                                                        as part,
  sum(case when m.movement = 'Stock out'    then m.qty else 0 end)      as stock_out,
  sum(case when m.movement = 'Consumption'  then m.qty else 0 end)      as consumed,
  sum(case when m.movement = 'Transfer in'  then m.qty else 0 end)      as transferred_in,
  sum(case when m.movement = 'Transfer out' then m.qty else 0 end)      as transferred_out,
  sum(case when m.movement = 'Return'       then m.qty else 0 end)      as returned,
  sum(case when m.direction = 'IN' then m.qty else -m.qty end)          as on_hand,
  max(m.moved_at) filter (where m.direction = 'IN')                     as last_in,
  max(m.moved_at) filter (where m.direction = 'OUT')                    as last_out,
  max(m.moved_at)                                                       as last_movement,
  count(*)                                                              as movements
from public.handstock_movements m
where m.engineer_key <> '' and m.part_code <> ''
group by m.engineer_key, m.part_code;

alter view public.handstock_movements set (security_invoker = on);
alter view public.handstock_balance   set (security_invoker = on);

grant select on public.handstock_movements to authenticated;
grant select on public.handstock_balance   to authenticated;

-- `engineer_stock` is a view over the balance (0023), so the Stock Transfer
-- screen and its overdraw guard pick the return up with no change of their own.
create view public.engineer_stock as
select b.engineer_key as engineer, b.part, b.on_hand as qty
  from public.handstock_balance b;
grant select on public.engineer_stock to authenticated;

-- ---------------------------------------------------------------------------
-- An engineer cannot return what they are not holding. Checked AFTER the row
-- lands, so the view already accounts for it — which also catches a multi-row
-- insert whose rows would individually pass but together over-draw.
--
-- Imported history is exempt: the sheet's returns predate the stock ledger
-- they would be checked against, and refusing them would make the import
-- impossible. They are loaded as `source = 'import'`.
-- ---------------------------------------------------------------------------
create or replace function public.material_returns_check_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare bal numeric;
begin
  if coalesce(new.source, 'app') = 'import' then return null; end if;
  bal := public.engineer_stock_available(new.engineer, new.part);
  if bal < 0 then
    -- bal is the balance AFTER this row, so a negative is the shortfall.
    raise exception
      'Material return exceeds hand stock: % would be left with % of %',
      new.engineer, bal, public.part_code(new.part);
  end if;
  return null;
end $$;

drop trigger if exists material_returns_check_stock on public.material_returns;
create trigger material_returns_check_stock
  after insert on public.material_returns
  for each row execute function public.material_returns_check_stock();

-- ---------------------------------------------------------------------------
-- Access. Neither key is on any role until granted.
--   mod:/mrn       opens the register.
--   stock.return   records a return (own stock, unless you may act for others).
-- Granted additively to the roles that already hold or move spares, plus
-- Stores, who receive the returned parts.
-- ---------------------------------------------------------------------------
update public.app_roles
   set permissions = coalesce(permissions, '[]'::jsonb) || '["stock.return","mod:/mrn"]'::jsonb,
       updated_at  = now()
 where role in ('admin', 'engineer', 'rm', 'rgm', 'spare_coordinator', 'stores_incharge')
   and not coalesce(permissions, '[]'::jsonb) ? 'stock.return';

-- Anyone who can already open Hand Stock can read the MRN register.
update public.app_roles
   set permissions = coalesce(permissions, '[]'::jsonb) || '["mod:/mrn"]'::jsonb,
       updated_at  = now()
 where coalesce(permissions, '[]'::jsonb) ? 'mod:/handstock'
   and not coalesce(permissions, '[]'::jsonb) ? 'mod:/mrn';
