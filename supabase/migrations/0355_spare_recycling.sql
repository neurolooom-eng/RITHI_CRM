-- ===========================================================================
-- 0355 — SPARE RECYCLING: A PARALLEL TRACK UNDER INDOOR SERVICE.
--
-- The user, 2026-10-04: "Create a Complete Work Flow for Spare Recycling,
-- Like Registration, spare request, job done details, consumption, handstock
-- -- This is a Parallel Track and should not collide with Regular Calls or
-- Spare or Handstock. Even the Stock should be maintained Separately. This is
-- Non Auditable Requirement and when i enable the Audit mode, it should not
-- show. Keep all this under Indoor Service. In Spare Request, there is no need
-- for approval. But during Stock out, Give a Provision to add Cost. I want to
-- be able to track how much i am spending for Recycling the Said spare."
--
-- And the answers that shaped it:
--   * a request is a DEFECTIVE SPARE, with an OPTIONAL call reference kept as
--     TEXT -- so nothing here ever reads or writes a call;
--   * the spares used come from the regular stores through an MRS (Material
--     Request Slip), raised WITHOUT approval; STORES books the stock out IN
--     THIS MODULE, with a unit cost, and the quantity lands in the requester's
--     RECYCLING hand stock -- a ledger of its own, never the regular one;
--   * closing the request consumes from that hand stock and records the job
--     done; it closes RETURNED (to the Service Store as R<PartNo>, recorded
--     only -- Part Master and the regular stock are untouched) or NOT
--     RECYCLABLE (with a reason);
--   * cost per request = the parts consumed, valued at their stock-out cost,
--     plus any other costs (labour, courier, vendor, other);
--   * numbering RCY/26/0001 and RMRS/26/0001, restarting each year.
--
-- NOTHING HERE TOUCHES calls, spare_requests, spare_dispatches,
-- spare_consumption, stock_transfers or any hand-stock function: separate
-- tables, separate ledger, separate keys.
--
-- HIDDEN IN AUDIT MODE, BY THE DATABASE. Every policy below adds
-- `not audit_mode()`: while Audit Mode is on, the screen is hidden AND every
-- read returns nothing and every write is refused -- the NAR pattern (a
-- non-auditable requirement).
--
-- THE KEYS ARE GRANTED TO NOBODY (the user's standing rule: Roles &
-- Permissions are theirs). An administrator passes has_perm() anyway; anyone
-- else is given them on Roles & Permissions -> Indoor Service.
--   recycle.view      see the recycling track
--   recycle.register  register a defective spare, record job done
--   recycle.request   raise an MRS
--   recycle.issue     book the stock out of an MRS, with cost (Stores)
--   recycle.close     consume, add other costs, close a request
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. THE TABLES
-- ---------------------------------------------------------------------------
create table if not exists public.recycle_requests (
  id                    bigint generated always as identity primary key,
  rcy_no                text unique,
  received_on           date not null default ((now() at time zone 'Asia/Kolkata')::date),
  part_code             text not null,
  part_description      text not null default '',
  serial                text not null default '',
  qty                   numeric not null default 1 check (qty > 0),
  received_from         text not null default '',
  call_ref              text not null default '',
  remarks               text not null default '',
  job_done              text not null default '',
  status                text not null default 'Open'
                          check (status in ('Open', 'Returned', 'Not recyclable')),
  returned_part_code    text not null default '',
  returned_qty          numeric check (returned_qty is null or returned_qty > 0),
  returned_on           date,
  not_recyclable_reason text not null default '',
  closed_at             timestamptz,
  closed_by             uuid,
  closed_by_name        text not null default '',
  created_at            timestamptz not null default now(),
  created_by            uuid,
  created_by_name       text not null default '',
  updated_at            timestamptz not null default now()
);

create table if not exists public.recycle_mrs (
  id                  bigint generated always as identity primary key,
  mrs_no              text unique,
  request_id          bigint references public.recycle_requests (id),
  requested_for       uuid,
  requested_for_name  text not null default '',
  remarks             text not null default '',
  created_at          timestamptz not null default now(),
  created_by          uuid
);

create table if not exists public.recycle_mrs_lines (
  id                bigint generated always as identity primary key,
  mrs_id            bigint not null references public.recycle_mrs (id) on delete cascade,
  part_code         text not null,
  part_description  text not null default '',
  qty               numeric not null check (qty > 0),
  created_at        timestamptz not null default now()
);

-- THE STOCK OUT, one row per booking, so a line can be issued in parts.
create table if not exists public.recycle_issues (
  id              bigint generated always as identity primary key,
  mrs_line_id     bigint not null references public.recycle_mrs_lines (id),
  qty             numeric not null check (qty > 0),
  unit_cost       numeric not null check (unit_cost >= 0),
  issued_at       timestamptz not null default now(),
  issued_by       uuid,
  issued_by_name  text not null default ''
);

create table if not exists public.recycle_consumption (
  id           bigint generated always as identity primary key,
  request_id   bigint not null references public.recycle_requests (id),
  holder       uuid,
  holder_name  text not null default '',
  part_code    text not null,
  qty          numeric not null check (qty > 0),
  consumed_at  timestamptz not null default now()
);

create table if not exists public.recycle_other_costs (
  id           bigint generated always as identity primary key,
  request_id   bigint not null references public.recycle_requests (id),
  cost_type    text not null default 'Other' check (cost_type in ('Labour', 'Courier', 'Vendor', 'Other')),
  description  text not null default '',
  amount       numeric not null check (amount >= 0),
  created_at   timestamptz not null default now(),
  created_by   uuid,
  created_by_name text not null default ''
);

create index if not exists recycle_mrs_lines_mrs_idx on public.recycle_mrs_lines (mrs_id);
create index if not exists recycle_issues_line_idx on public.recycle_issues (mrs_line_id);
create index if not exists recycle_consumption_req_idx on public.recycle_consumption (request_id);
create index if not exists recycle_consumption_holder_idx on public.recycle_consumption (holder, part_code);
create index if not exists recycle_other_costs_req_idx on public.recycle_other_costs (request_id);

-- THE FIVE SYSTEM COLUMNS (0244) on each new table now, rather than waiting
-- for sys_columns.sql to be re-run -- the pattern 0332 uses.
do $$
declare t text;
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    foreach t in array array['recycle_requests', 'recycle_mrs', 'recycle_mrs_lines', 'recycle_issues',
                             'recycle_consumption', 'recycle_other_costs'] loop
      perform public.sys_columns_attach(('public.' || t)::regclass);
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. WHO IS SIGNED IN, BY NAME -- the profile's name, else its email.
-- ---------------------------------------------------------------------------
create or replace function public.recycle_me_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.email), ''))
                     from public.profiles p where p.id = auth.uid()), coalesce(auth.email(), ''));
$$;
revoke execute on function public.recycle_me_name() from public, anon, authenticated;

-- The next number of a series for this year: PREFIX/YY/0001, restarting each
-- year. Under an advisory lock so two at once cannot take the same number --
-- and no counter table, so nothing here needs the counters' exceptions.
create or replace function public.recycle_next_no(p_prefix text, p_table regclass, p_col text)
returns text language plpgsql security definer set search_path = public as $$
declare
  yy  text := to_char(now() at time zone 'Asia/Kolkata', 'YY');
  n   integer;
begin
  perform pg_advisory_xact_lock(hashtext('recycle_no:' || p_prefix || ':' || yy));
  execute format(
    'select coalesce(max(nullif(split_part(%I, ''/'', 3), '''')::int), 0) from %s where %I like $1',
    p_col, p_table, p_col)
    into n using p_prefix || '/' || yy || '/%';
  return p_prefix || '/' || yy || '/' || lpad((n + 1)::text, 4, '0');
end $$;
revoke execute on function public.recycle_next_no(text, regclass, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. THE GUARDS -- stamped columns are the database's, and the rules a
--    screen could skip are refused here.
-- ---------------------------------------------------------------------------
create or replace function public.recycle_requests_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.rcy_no := public.recycle_next_no('RCY', 'public.recycle_requests', 'rcy_no');
    new.created_by := auth.uid();
    new.created_by_name := public.recycle_me_name();
    new.status := 'Open';
    new.returned_part_code := ''; new.returned_qty := null; new.returned_on := null;
    new.closed_at := null; new.closed_by := null; new.closed_by_name := '';
    new.part_code := btrim(new.part_code);
    if new.part_code = '' then raise exception 'Part code is required.'; end if;
    return new;
  end if;

  -- UPDATE
  new.rcy_no := old.rcy_no; new.created_by := old.created_by;
  new.created_by_name := old.created_by_name; new.created_at := old.created_at;
  new.updated_at := now();
  if old.status <> 'Open' then
    raise exception 'Recycling request % is closed (%) and cannot be changed.', old.rcy_no, old.status;
  end if;
  if new.status = 'Open' then
    new.returned_part_code := ''; new.returned_qty := null; new.returned_on := null;
    new.closed_at := null; new.closed_by := null; new.closed_by_name := '';
    return new;
  end if;

  -- CLOSING
  if not coalesce(public.has_perm('recycle.close'), false) then
    raise exception 'RBAC: closing a recycling request needs "Consume, add costs and close a recycling request"';
  end if;
  if btrim(coalesce(new.job_done, '')) = '' then
    raise exception 'Record the job done before closing %.', old.rcy_no;
  end if;
  new.closed_at := now();
  new.closed_by := auth.uid();
  new.closed_by_name := public.recycle_me_name();
  if new.status = 'Returned' then
    -- RETURNED TO THE SERVICE STORE AS R<PartNo>, recorded here only.
    new.returned_part_code := 'R' || old.part_code;
    new.returned_qty := coalesce(new.returned_qty, old.qty);
    new.returned_on := coalesce(new.returned_on, (now() at time zone 'Asia/Kolkata')::date);
    new.not_recyclable_reason := '';
  else
    if btrim(coalesce(new.not_recyclable_reason, '')) = '' then
      raise exception 'Say why % is not recyclable.', old.rcy_no;
    end if;
    new.returned_part_code := ''; new.returned_qty := null; new.returned_on := null;
  end if;
  return new;
end $$;
revoke execute on function public.recycle_requests_guard() from public, anon, authenticated;
drop trigger if exists recycle_requests_guard on public.recycle_requests;
create trigger recycle_requests_guard before insert or update on public.recycle_requests
  for each row execute function public.recycle_requests_guard();

create or replace function public.recycle_mrs_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.mrs_no := public.recycle_next_no('RMRS', 'public.recycle_mrs', 'mrs_no');
    -- THE SPARES GO TO THE HAND STOCK OF WHOEVER RAISED IT.
    new.requested_for := auth.uid();
    new.requested_for_name := public.recycle_me_name();
    new.created_by := auth.uid();
  else
    new.mrs_no := old.mrs_no; new.requested_for := old.requested_for;
    new.requested_for_name := old.requested_for_name; new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  if new.request_id is not null
     and exists (select 1 from public.recycle_requests r where r.id = new.request_id and r.status <> 'Open') then
    raise exception 'That recycling request is closed; raise the MRS against an open one, or none.';
  end if;
  return new;
end $$;
revoke execute on function public.recycle_mrs_guard() from public, anon, authenticated;
drop trigger if exists recycle_mrs_guard on public.recycle_mrs;
create trigger recycle_mrs_guard before insert or update on public.recycle_mrs
  for each row execute function public.recycle_mrs_guard();

-- A LINE CANNOT BE ISSUED BEYOND WHAT IT ASKED FOR, and a line already issued
-- from cannot have its part or quantity changed under the issue.
create or replace function public.recycle_mrs_lines_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.part_code := btrim(new.part_code);
  if new.part_code = '' then raise exception 'Part code is required.'; end if;
  if tg_op = 'UPDATE' and exists (select 1 from public.recycle_issues i where i.mrs_line_id = old.id) then
    if new.part_code <> old.part_code then
      raise exception 'Stock has been issued against this line; its part cannot change.';
    end if;
    if new.qty < (select sum(i.qty) from public.recycle_issues i where i.mrs_line_id = old.id) then
      raise exception 'Stock has been issued against this line; its quantity cannot go below what was issued.';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.recycle_mrs_lines_guard() from public, anon, authenticated;
drop trigger if exists recycle_mrs_lines_guard on public.recycle_mrs_lines;
create trigger recycle_mrs_lines_guard before insert or update on public.recycle_mrs_lines
  for each row execute function public.recycle_mrs_lines_guard();

create or replace function public.recycle_issues_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  asked   numeric;
  given   numeric;
begin
  if tg_op = 'UPDATE' then
    raise exception 'A stock out is not edited. Book another for the remainder.';
  end if;
  select l.qty into asked from public.recycle_mrs_lines l where l.id = new.mrs_line_id for update;
  if asked is null then raise exception 'No such MRS line.'; end if;
  select coalesce(sum(i.qty), 0) into given from public.recycle_issues i where i.mrs_line_id = new.mrs_line_id;
  if given + new.qty > asked then
    raise exception 'Only % more can be issued against this line (asked %, issued %).', asked - given, asked, given;
  end if;
  new.issued_at := now();
  new.issued_by := auth.uid();
  new.issued_by_name := public.recycle_me_name();
  return new;
end $$;
revoke execute on function public.recycle_issues_guard() from public, anon, authenticated;
drop trigger if exists recycle_issues_guard on public.recycle_issues;
create trigger recycle_issues_guard before insert or update on public.recycle_issues
  for each row execute function public.recycle_issues_guard();

-- ---------------------------------------------------------------------------
-- 4. THE RECYCLING HAND STOCK -- issued to a holder, less what the holder
--    consumed. Derived, never stored, like the regular one; and kept apart
--    from it entirely.
-- ---------------------------------------------------------------------------
create or replace function public.recycle_balance(p_holder uuid, p_part text)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select sum(i.qty)
                     from public.recycle_issues i
                     join public.recycle_mrs_lines l on l.id = i.mrs_line_id
                     join public.recycle_mrs m on m.id = l.mrs_id
                    where m.requested_for = p_holder and l.part_code = p_part), 0)
       - coalesce((select sum(c.qty) from public.recycle_consumption c
                    where c.holder = p_holder and c.part_code = p_part), 0);
$$;
revoke execute on function public.recycle_balance(uuid, text) from public, anon, authenticated;

create or replace function public.recycle_consumption_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  st   text;
  bal  numeric;
begin
  if tg_op = 'UPDATE' then
    raise exception 'A consumption line is not edited. Remove it and enter it again.';
  end if;
  if tg_op = 'DELETE' then
    select r.status into st from public.recycle_requests r where r.id = old.request_id;
    if st <> 'Open' then raise exception 'The request is closed; its consumption stays.'; end if;
    return old;
  end if;
  select r.status into st from public.recycle_requests r where r.id = new.request_id;
  if st is null then raise exception 'No such recycling request.'; end if;
  if st <> 'Open' then raise exception 'The request is closed; nothing more can be consumed on it.'; end if;
  -- FROM THE CONSUMER'S OWN RECYCLING HAND STOCK, and never more than it holds.
  new.holder := auth.uid();
  new.holder_name := public.recycle_me_name();
  new.part_code := btrim(new.part_code);
  perform pg_advisory_xact_lock(hashtext('recycle_bal:' || coalesce(new.holder::text, '') || ':' || new.part_code));
  bal := public.recycle_balance(new.holder, new.part_code);
  if new.qty > bal then
    raise exception 'Your recycling hand stock of % is %; % cannot be consumed.', new.part_code, bal, new.qty;
  end if;
  new.consumed_at := now();
  return new;
end $$;
revoke execute on function public.recycle_consumption_guard() from public, anon, authenticated;
drop trigger if exists recycle_consumption_guard on public.recycle_consumption;
create trigger recycle_consumption_guard before insert or update or delete on public.recycle_consumption
  for each row execute function public.recycle_consumption_guard();

create or replace function public.recycle_other_costs_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  st text;
begin
  select r.status into st from public.recycle_requests r
   where r.id = case when tg_op = 'DELETE' then old.request_id else new.request_id end;
  if st is distinct from 'Open' then raise exception 'The request is closed; its costs stay as they are.'; end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_by_name := public.recycle_me_name();
    new.created_at := now();
  else
    new.request_id := old.request_id; new.created_by := old.created_by;
    new.created_by_name := old.created_by_name; new.created_at := old.created_at;
  end if;
  return new;
end $$;
revoke execute on function public.recycle_other_costs_guard() from public, anon, authenticated;
drop trigger if exists recycle_other_costs_guard on public.recycle_other_costs;
create trigger recycle_other_costs_guard before insert or update or delete on public.recycle_other_costs
  for each row execute function public.recycle_other_costs_guard();

-- ---------------------------------------------------------------------------
-- 5. ROW-LEVEL SECURITY -- the keys, and NOT IN AUDIT MODE.
-- ---------------------------------------------------------------------------
create or replace function public.recycle_may_see()
returns boolean language sql stable security definer set search_path = public as $$
  select not coalesce(public.audit_mode(), false)
     and (coalesce(public.has_perm('recycle.view'), false)
       or coalesce(public.has_perm('recycle.register'), false)
       or coalesce(public.has_perm('recycle.request'), false)
       or coalesce(public.has_perm('recycle.issue'), false)
       or coalesce(public.has_perm('recycle.close'), false));
$$;
revoke execute on function public.recycle_may_see() from public, anon;
grant execute on function public.recycle_may_see() to authenticated;

create or replace function public.recycle_may(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select not coalesce(public.audit_mode(), false) and coalesce(public.has_perm(p_key), false);
$$;
revoke execute on function public.recycle_may(text) from public, anon;
grant execute on function public.recycle_may(text) to authenticated;

alter table public.recycle_requests    enable row level security;
alter table public.recycle_mrs         enable row level security;
alter table public.recycle_mrs_lines   enable row level security;
alter table public.recycle_issues      enable row level security;
alter table public.recycle_consumption enable row level security;
alter table public.recycle_other_costs enable row level security;

drop policy if exists rr_read on public.recycle_requests;
create policy rr_read on public.recycle_requests for select using ((select public.recycle_may_see()));
drop policy if exists rr_insert on public.recycle_requests;
create policy rr_insert on public.recycle_requests for insert with check ((select public.recycle_may('recycle.register')));
drop policy if exists rr_update on public.recycle_requests;
create policy rr_update on public.recycle_requests for update
  using ((select public.recycle_may('recycle.register')) or (select public.recycle_may('recycle.close')))
  with check ((select public.recycle_may('recycle.register')) or (select public.recycle_may('recycle.close')));

drop policy if exists rm_read on public.recycle_mrs;
create policy rm_read on public.recycle_mrs for select using ((select public.recycle_may_see()));
drop policy if exists rm_insert on public.recycle_mrs;
create policy rm_insert on public.recycle_mrs for insert with check ((select public.recycle_may('recycle.request')));

drop policy if exists rml_read on public.recycle_mrs_lines;
create policy rml_read on public.recycle_mrs_lines for select using ((select public.recycle_may_see()));
drop policy if exists rml_insert on public.recycle_mrs_lines;
create policy rml_insert on public.recycle_mrs_lines for insert with check ((select public.recycle_may('recycle.request')));

drop policy if exists ri_read on public.recycle_issues;
create policy ri_read on public.recycle_issues for select using ((select public.recycle_may_see()));
drop policy if exists ri_insert on public.recycle_issues;
create policy ri_insert on public.recycle_issues for insert with check ((select public.recycle_may('recycle.issue')));

drop policy if exists rc_read on public.recycle_consumption;
create policy rc_read on public.recycle_consumption for select using ((select public.recycle_may_see()));
drop policy if exists rc_insert on public.recycle_consumption;
create policy rc_insert on public.recycle_consumption for insert with check ((select public.recycle_may('recycle.close')));
drop policy if exists rc_delete on public.recycle_consumption;
create policy rc_delete on public.recycle_consumption for delete using ((select public.recycle_may('recycle.close')));

drop policy if exists roc_read on public.recycle_other_costs;
create policy roc_read on public.recycle_other_costs for select using ((select public.recycle_may_see()));
drop policy if exists roc_insert on public.recycle_other_costs;
create policy roc_insert on public.recycle_other_costs for insert with check ((select public.recycle_may('recycle.close')));
drop policy if exists roc_delete on public.recycle_other_costs;
create policy roc_delete on public.recycle_other_costs for delete using ((select public.recycle_may('recycle.close')));

grant select, insert, update on public.recycle_requests to authenticated;
grant select, insert on public.recycle_mrs, public.recycle_mrs_lines, public.recycle_issues to authenticated;
grant select, insert, delete on public.recycle_consumption, public.recycle_other_costs to authenticated;
revoke all on public.recycle_requests, public.recycle_mrs, public.recycle_mrs_lines, public.recycle_issues,
              public.recycle_consumption, public.recycle_other_costs from anon;

-- ---------------------------------------------------------------------------
-- 6. THE VIEWS THE SCREEN READS (security_invoker: the policies above apply).
-- ---------------------------------------------------------------------------

-- An MRS line with what has been issued against it, and at what cost.
create or replace view public.recycle_mrs_list as
select l.id as line_id, m.id as mrs_id, m.mrs_no, m.request_id, r.rcy_no,
       m.requested_for, m.requested_for_name, m.remarks, m.created_at,
       l.part_code, l.part_description, l.qty as qty_requested,
       coalesce(i.qty_issued, 0) as qty_issued,
       l.qty - coalesce(i.qty_issued, 0) as qty_pending,
       coalesce(i.cost_issued, 0) as cost_issued,
       i.last_issued_at,
       case when coalesce(i.qty_issued, 0) = 0 then 'Pending'
            when i.qty_issued < l.qty then 'Partly issued'
            else 'Issued' end as status
  from public.recycle_mrs_lines l
  join public.recycle_mrs m on m.id = l.mrs_id
  left join public.recycle_requests r on r.id = m.request_id
  left join lateral (
    select sum(x.qty) as qty_issued, sum(x.qty * x.unit_cost) as cost_issued, max(x.issued_at) as last_issued_at
      from public.recycle_issues x where x.mrs_line_id = l.id
  ) i on true;
alter view public.recycle_mrs_list set (security_invoker = on);
grant select on public.recycle_mrs_list to authenticated;

-- THE RECYCLING HAND STOCK, per holder and part, with the average stock-out
-- cost -- what a consumed unit is valued at.
create or replace view public.recycle_hand_stock as
with iss as (
  select m.requested_for as holder, max(m.requested_for_name) as holder_name, l.part_code,
         max(l.part_description) as part_description,
         sum(i.qty) as issued, sum(i.qty * i.unit_cost) as issued_cost
    from public.recycle_issues i
    join public.recycle_mrs_lines l on l.id = i.mrs_line_id
    join public.recycle_mrs m on m.id = l.mrs_id
   group by m.requested_for, l.part_code
), con as (
  select c.holder, c.part_code, sum(c.qty) as consumed
    from public.recycle_consumption c group by c.holder, c.part_code
)
select iss.holder, iss.holder_name, iss.part_code, iss.part_description,
       iss.issued, coalesce(con.consumed, 0) as consumed,
       iss.issued - coalesce(con.consumed, 0) as balance,
       case when iss.issued > 0 then round(iss.issued_cost / iss.issued, 4) end as avg_unit_cost
  from iss left join con on con.holder = iss.holder and con.part_code = iss.part_code;
alter view public.recycle_hand_stock set (security_invoker = on);
grant select on public.recycle_hand_stock to authenticated;

-- A consumption line with its value: the holder's average stock-out cost for
-- that part.
create or replace view public.recycle_consumption_list as
select c.id, c.request_id, r.rcy_no, c.holder, c.holder_name, c.part_code, c.qty, c.consumed_at,
       h.avg_unit_cost, round(c.qty * coalesce(h.avg_unit_cost, 0), 2) as value
  from public.recycle_consumption c
  join public.recycle_requests r on r.id = c.request_id
  left join public.recycle_hand_stock h on h.holder = c.holder and h.part_code = c.part_code;
alter view public.recycle_consumption_list set (security_invoker = on);
grant select on public.recycle_consumption_list to authenticated;

-- THE REQUEST WITH WHAT IT COST: parts consumed + other costs. The cost of
-- stock ISSUED on its MRSs is shown beside it, because issued is not used.
-- Columns NAMED, never r.*: `*` is expanded at creation, and the system
-- columns 0244 adds later would make a replay of this bundle a different view.
create or replace view public.recycle_request_list as
select r.id, r.rcy_no, r.received_on, r.part_code, r.part_description, r.serial, r.qty,
       r.received_from, r.call_ref, r.remarks, r.job_done, r.status,
       r.returned_part_code, r.returned_qty, r.returned_on, r.not_recyclable_reason,
       r.closed_at, r.closed_by, r.closed_by_name, r.created_at, r.created_by, r.created_by_name,
       r.updated_at,
       coalesce(pc.parts_cost, 0) as parts_cost,
       coalesce(oc.other_cost, 0) as other_cost,
       coalesce(pc.parts_cost, 0) + coalesce(oc.other_cost, 0) as total_cost,
       coalesce(ic.issued_cost, 0) as issued_cost
  from public.recycle_requests r
  left join lateral (select sum(v.value) as parts_cost from public.recycle_consumption_list v where v.request_id = r.id) pc on true
  left join lateral (select sum(o.amount) as other_cost from public.recycle_other_costs o where o.request_id = r.id) oc on true
  left join lateral (select sum(x.cost_issued) as issued_cost from public.recycle_mrs_list x where x.request_id = r.id) ic on true;
alter view public.recycle_request_list set (security_invoker = on);
grant select on public.recycle_request_list to authenticated;

-- ---------------------------------------------------------------------------
-- 7. THE SCREEN'S KEY, IN THE ADMIN AND TECHNICAL SUPPORT ROLES ONLY (the
--    0241 pattern). An administrator passes every check anyway; Technical
--    Support holds every screen key the admin does (0145, _status.sql row
--    114) -- and the key only OPENS the page: every row needs a recycle.* key,
--    which no role is given, so it sees an empty page. Every other role is
--    given access -- or not -- on Roles & Permissions (the user's rule).
-- ---------------------------------------------------------------------------
do $$
declare n integer;
begin
  if to_regclass('public.app_roles') is null then return; end if;
  update public.app_roles ar
     set permissions = (
           select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
             from (select jsonb_array_elements_text(ar.permissions) as v
                   union select unnest(array['mod:/indoor/recycling']) as v) u),
         updated_at = now()
   where jsonb_array_length(ar.permissions) > 0
     and ar.role in ('admin', 'technical_support')
     and not (ar.permissions ? 'mod:/indoor/recycling');
  get diagnostics n = row_count;
  raise notice '0355: Spare Recycling screen key given to admin + technical_support (% of 2 rows) -- grant the rest on Roles & Permissions', n;
end $$;
