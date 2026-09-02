-- ===========================================================================
-- Stores dispatch — one stock-out, many spares, one engineer.
--
-- Dispatch is decided per SPARE (0016), but it HAPPENS in batches: the Stores
-- incharge picks everything waiting for one engineer and books it out in one
-- go. That batch is a real document, so it gets a row of its own:
--
--   spare_dispatches   — one row per stock-out. Carries the STOCK OUT number
--                        and the DC number, both generated here, and the
--                        engineer everything in it is going to.
--   spare_request_lines.dispatch_uid / stock_out_no
--                      — the line's link back to it. dc_number already existed
--                        and keeps its meaning, so hand stock, the register,
--                        the trail and the imported history all still read.
--
-- Numbering follows the OR / ST convention already in the app — a monthly
-- counter, upserted atomically, so concurrent dispatches cannot collide:
--   SO-YYMM-NNNN   stock out
--   DC-YYMM-NNNN   delivery challan
--
-- NB: the DC FORMAT is still to be confirmed by the business. It is produced
-- in exactly one place — next_dc_number() — so changing it later is a one
-- function change and touches no other object.
--
-- Nothing here changes what a dispatch MEANS downstream: stores_status stays
-- 'Dispatched' and dispatched_at is still the moment it left, so
-- handstock_movements (0023) counts it as stock in the engineer's hands from
-- the stock-out, with no acknowledgement needed — which is what puts it in
-- the call report's spare-consumption picker.
-- ===========================================================================

alter table public.spare_request_lines
  add column if not exists dispatch_uid text,
  add column if not exists stock_out_no text;

create table if not exists public.spare_dispatches (
  id             bigint generated always as identity primary key,
  uid            text unique not null,           -- SO-YYMM-NNNN (stock out)
  dc_number      text,                           -- DC-YYMM-NNNN
  dc_date        date not null default current_date,
  engineer       text not null,
  engineer_email text default '',
  courier        text default '',
  remarks        text default '',
  line_count     integer not null default 0,
  total_qty      numeric not null default 0,
  dispatched_by  text default '',
  dispatched_at  timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id) default auth.uid()
);
create index if not exists spare_dispatches_engineer_idx on public.spare_dispatches (lower(btrim(engineer)));
create index if not exists spare_dispatches_at_idx       on public.spare_dispatches (dispatched_at desc);
create index if not exists spare_request_lines_dispatch_uid_idx on public.spare_request_lines (dispatch_uid);

-- ---------------------------------------------------------------------------
-- Numbers. One counter table, two series, both restarting each month. The
-- upsert is what makes them safe under concurrency: the row is locked by the
-- ON CONFLICT, so two dispatchers in the same millisecond get 0007 and 0008,
-- never 0007 twice.
-- ---------------------------------------------------------------------------
create table if not exists public.spare_dispatch_counters (
  series  text not null,
  period  text not null,
  last_no integer not null default 0,
  primary key (series, period)
);
alter table public.spare_dispatch_counters enable row level security;  -- definer-only

create or replace function public.next_dispatch_no(p_series text, p_on date)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.spare_dispatch_counters (series, period, last_no)
       values (p_series, to_char(p_on, 'YYMM'), 1)
  on conflict (series, period)
    do update set last_no = public.spare_dispatch_counters.last_no + 1
  returning last_no into n;
  return n;
end $$;

create or replace function public.next_stock_out_no(p_on date default current_date)
returns text language sql security definer set search_path = public as $$
  select 'SO-' || to_char(p_on, 'YYMM') || '-'
      || lpad(public.next_dispatch_no('stock_out', p_on)::text, 4, '0');
$$;

-- The one place a DC number is made. Format pending business confirmation.
create or replace function public.next_dc_number(p_on date default current_date)
returns text language sql security definer set search_path = public as $$
  select 'DC-' || to_char(p_on, 'YYMM') || '-'
      || lpad(public.next_dispatch_no('dc', p_on)::text, 4, '0');
$$;

grant execute on function public.next_stock_out_no(date) to authenticated;
grant execute on function public.next_dc_number(date)    to authenticated;

create or replace function public.spare_dispatches_assign_no()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.dc_date is null then new.dc_date := current_date; end if;
  if new.uid is null or btrim(new.uid) = '' then
    new.uid := public.next_stock_out_no(new.dc_date);
  end if;
  if new.dc_number is null or btrim(new.dc_number) = '' then
    new.dc_number := public.next_dc_number(new.dc_date);
  end if;
  return new;
end $$;
drop trigger if exists spare_dispatches_assign_no on public.spare_dispatches;
create trigger spare_dispatches_assign_no
  before insert on public.spare_dispatches
  for each row execute function public.spare_dispatches_assign_no();

-- ---------------------------------------------------------------------------
-- What Stores is waiting to send. One row per spare that has cleared every
-- approval and has not been dispatched or dropped, with the engineer it is
-- going to — which is what the screen groups by.
--
-- security_invoker, so the rows a user sees are exactly the lines they may
-- already read in the register.
-- ---------------------------------------------------------------------------
-- Guarded: 0055_partial_dispatch.sql OWNS this view now and appended
-- requested_qty / dispatched_qty to it. `create or replace view` cannot drop
-- columns, so re-running this file over a fully-migrated project failed with
-- "cannot drop columns from view" and took the rest of all.sql down with it.
-- The later definition supersedes this one, so skipping is a no-op.
do $spd$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'spare_pending_dispatch'
                and column_name = 'dispatched_qty') then
    return;
  end if;

  execute $view$
    create or replace view public.spare_pending_dispatch as
    select
      l.id                                        as line_id,
      l.line_uid,
      l.request_uid,
      r.or_no,
      r.or_req_date,
      l.row_no,
      l.part,
      -- part_code() / handstock_key() (0023) say the same thing, but the hand
      -- stock module applies AFTER this one in all.sql — so the expressions are
      -- inlined rather than making the spare bundle depend on that one.
      upper(btrim(split_part(coalesce(l.part, ''), '|', 1)))
                                                  as part_code,
      l.qty,
      r.req_type,
      r.item_status,
      coalesce(r.engineer, '')                    as engineer,
      lower(btrim(coalesce(r.engineer, '')))      as engineer_key,
      coalesce(r.engineer_email, '')              as engineer_email,
      coalesce(r.ucn, '')                         as ucn,
      coalesce(r.call_number, '')                 as call_number,
      coalesce(r.party_name, '')                  as party_name,
      coalesce(r.product_name, '')                as product_name,
      coalesce(r.serial, '')                      as serial,
      coalesce(r.handstock_reason, '')            as handstock_reason,
      coalesce(r.remarks, '')                     as remarks,
      l.rm_by, l.rm_at, l.commercial_by, l.commercial_at, l.nsm_by, l.nsm_at,
      coalesce(l.created_at, r.created_at)        as raised_at,
      -- how long it has been sitting in the Stores queue
      greatest(coalesce(l.nsm_at, l.commercial_at, l.rm_at, l.created_at, r.created_at),
               coalesce(l.created_at, r.created_at))                       as waiting_since
    from public.spare_request_lines l
    join public.spare_requests r on r.uid = l.request_uid
    where l.stage = 'Stores' and coalesce(l.dispatch_uid, '') = ''
  $view$;
end $spd$;


alter view public.spare_pending_dispatch set (security_invoker = on);
grant select on public.spare_pending_dispatch to authenticated;

-- ---------------------------------------------------------------------------
-- Dispatch a batch, atomically.
--
-- Everything the Stores incharge ticked goes out under ONE stock-out and ONE
-- DC, so the whole batch either lands or none of it does. The checks are here
-- rather than in the screen because the screen is not the only way in:
--   • the caller must hold spare.dispatch;
--   • every line must still be waiting at Stores (not already sent, dropped
--     or rejected while the screen was open);
--   • every line must be going to the SAME engineer — a DC is one delivery to
--     one person.
-- ---------------------------------------------------------------------------
create or replace function public.dispatch_spare_lines(
  p_line_ids bigint[],
  p_courier  text default '',
  p_remarks  text default '',
  p_dc_date  date default current_date,
  p_actor    text default ''
) returns public.spare_dispatches
language plpgsql security definer set search_path = public as $$
declare
  eng   text;
  n     integer;
  qty   numeric;
  head  public.spare_dispatches;
  email text;
begin
  if not (public.is_admin() or public.has_perm('spare.dispatch')) then
    raise exception 'RBAC: dispatch requires the spare.dispatch permission';
  end if;
  if p_line_ids is null or array_length(p_line_ids, 1) is null then
    raise exception 'Nothing to dispatch: no spares selected';
  end if;

  select count(*), sum(v.qty), min(v.engineer), min(v.engineer_email)
    into n, qty, eng, email
    from public.spare_pending_dispatch v
   where v.line_id = any (p_line_ids);

  if coalesce(n, 0) <> array_length(p_line_ids, 1) then
    raise exception
      'Only % of the % selected spares are still waiting at Stores — refresh and try again',
      coalesce(n, 0), array_length(p_line_ids, 1);
  end if;
  if (select count(distinct v.engineer_key) from public.spare_pending_dispatch v
       where v.line_id = any (p_line_ids)) <> 1 then
    raise exception 'A stock out goes to one engineer — select spares for a single engineer';
  end if;

  insert into public.spare_dispatches
    (dc_date, engineer, engineer_email, courier, remarks, line_count, total_qty, dispatched_by)
  values
    (coalesce(p_dc_date, current_date), eng, coalesce(email, ''), coalesce(p_courier, ''),
     coalesce(p_remarks, ''), n, coalesce(qty, 0), coalesce(nullif(btrim(p_actor), ''), ''))
  returning * into head;

  update public.spare_request_lines l
     set stores_status    = 'Dispatched',
         dispatch_uid     = head.uid,
         stock_out_no     = head.uid,
         dc_number        = head.dc_number,
         courier          = coalesce(p_courier, ''),
         dispatch_remarks = coalesce(p_remarks, ''),
         dispatched_by    = head.dispatched_by,
         dispatched_at    = head.dispatched_at
   where l.id = any (p_line_ids);

  return head;
end $$;
grant execute on function public.dispatch_spare_lines(bigint[], text, text, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The batch columns belong to the dispatch stage: same permission as the DC.
-- Re-stated in full (0016's guard predates these columns).
-- ---------------------------------------------------------------------------
create or replace function public.spare_request_lines_dispatch_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  if (new.dispatch_uid is distinct from old.dispatch_uid
      or new.stock_out_no is distinct from old.stock_out_no)
     and not public.has_perm('spare.dispatch') then
    raise exception 'RBAC: recording a stock out requires the spare.dispatch permission';
  end if;
  return new;
end $$;
drop trigger if exists spare_request_lines_dispatch_guard on public.spare_request_lines;
-- Triggers fire in name order, so this one runs BEFORE
-- spare_request_lines_guard ('d' < 'g'). Either order is fine: both only
-- raise, neither changes the row.
create trigger spare_request_lines_dispatch_guard
  before update on public.spare_request_lines
  for each row execute function public.spare_request_lines_dispatch_guard();

-- ---------------------------------------------------------------------------
-- RLS. A dispatch is readable by anyone who can see the spares in it — the
-- engineer it went to, their line management, and Stores; only spare.dispatch
-- can write one (the RPC above is the supported route).
-- ---------------------------------------------------------------------------
alter table public.spare_dispatches enable row level security;

drop policy if exists sd_read on public.spare_dispatches;
create policy sd_read on public.spare_dispatches for select
  using (public.is_admin() or created_by = auth.uid()
      or public.has_perm('spare.dispatch')
      or lower(btrim(engineer)) in (select lower(btrim(n)) from public.visible_engineer_names() as v(n)));

drop policy if exists sd_insert on public.spare_dispatches;
create policy sd_insert on public.spare_dispatches for insert
  with check (public.is_admin() or public.has_perm('spare.dispatch'));

drop policy if exists sd_update on public.spare_dispatches;
create policy sd_update on public.spare_dispatches for update
  using (public.is_admin() or public.has_perm('spare.dispatch'))
  with check (public.is_admin() or public.has_perm('spare.dispatch'));

-- ---------------------------------------------------------------------------
-- Access. The screen is for whoever already dispatches; append additively so
-- an admin's later edits to a role are left alone.
-- ---------------------------------------------------------------------------
update public.app_roles
   set permissions = coalesce(permissions, '[]'::jsonb) || '["mod:/spare-dispatch"]'::jsonb,
       updated_at  = now()
 where coalesce(permissions, '[]'::jsonb) ? 'spare.dispatch'
   and not coalesce(permissions, '[]'::jsonb) ? 'mod:/spare-dispatch';

-- Lines dispatched before this migration have a DC but no stock out. Give them
-- their DC number as the stock-out reference so the register is not half
-- blank; a real SO number only exists for batches booked out through the
-- screen. Runs with the guard dropped: this is a data migration, not somebody
-- dispatching, and auth.uid() is NULL in the SQL editor.
drop trigger if exists spare_request_lines_guard          on public.spare_request_lines;
drop trigger if exists spare_request_lines_dispatch_guard on public.spare_request_lines;
update public.spare_request_lines
   set stock_out_no = dc_number
 where coalesce(stores_status, '') ~* 'dispatch'
   and coalesce(stock_out_no, '') = ''
   and coalesce(dc_number, '') <> '';
create trigger spare_request_lines_guard
  before update on public.spare_request_lines
  for each row execute function public.spare_request_lines_guard();
create trigger spare_request_lines_dispatch_guard
  before update on public.spare_request_lines
  for each row execute function public.spare_request_lines_dispatch_guard();
