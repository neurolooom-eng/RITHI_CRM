-- ===========================================================================
-- RITHI CRM — Call Requests, call state and Call Number: one file to paste.
--
-- Carries migrations 0010-0013 in order:
--   0010_call_request_items    a request is one row per call, sharing its REQID
--   0011_call_request_actions  the Hotline outcomes: mapped / registered / cancelled
--   0012_call_state            latest-visit state on the call + the two views
--   0013_call_number           the request UniqueID, else CLYY#####
--
-- Needs the base schema (0001-0003). Safe to run more than once.
-- Paste into the Supabase SQL Editor and Run.
-- ===========================================================================

-- ------------------------------------------------------------------------
-- 0010_call_request_items.sql
-- ------------------------------------------------------------------------

-- ===========================================================================
-- Multi-item call requests. A request is up to 5 calls (Product + Serial No +
-- Standard Complaint + Reported Problem) that SHARE one REQID, so REQID cannot
-- be unique — the per-row identity is UniqueID (REQID-Product-SerialNo).
--
-- Before this, inserting the 2nd..5th item failed with
--   duplicate key value violates unique constraint "call_requests_reqid_key"
-- leaving the request half-saved (item 1 only).
-- ===========================================================================

alter table public.call_requests drop constraint if exists call_requests_reqid_key;
create index if not exists call_requests_reqid_idx on public.call_requests (reqid);

-- The real identity: one row per product/serial within a request.
create unique index if not exists call_requests_unique_key_uidx
  on public.call_requests (unique_key);

-- Mint a REQID up front so the whole request goes in as ONE insert and can
-- never be half-saved. The trigger still assigns one when this isn't used.
create or replace function public.next_call_reqid()
returns text language sql security definer set search_path = public as $$
  select 'R' || nextval('public.call_req_seq')::text;
$$;
grant execute on function public.next_call_reqid() to authenticated;

-- ------------------------------------------------------------------------
-- 0011_call_request_actions.sql
-- ------------------------------------------------------------------------

-- ===========================================================================
-- Call request actions (Hotline): a pending request is closed out in one of
-- three ways —
--   • Registered — a new call was created from it (UCN written back)
--   • Mapped     — it belongs to an existing call (that call's UCN written back)
--   • Cancelled  — not a call; reason recorded
-- A request leaves the pending list once it has a UCN or is cancelled.
-- ===========================================================================

alter table public.call_requests
  add column if not exists cancel_reason text default '',
  add column if not exists cancelled_at  timestamptz,
  add column if not exists actioned_by   text default '',
  add column if not exists actioned_at   timestamptz;

create index if not exists call_requests_status_idx on public.call_requests (status);

-- 0003 ships permissive insert/update policies; 0008 (RBAC enforcement)
-- replaces them with permission checks. Re-applying 0003 — which the
-- call_requests apply bundle does — would silently hand them back, so put the
-- RBAC versions back whenever has_perm() is present.
do $$
begin
  if to_regprocedure('public.has_perm(text)') is null then return; end if;

  execute 'drop policy if exists cr_insert on public.call_requests';
  execute $p$create policy cr_insert on public.call_requests for insert
    with check (public.has_perm('request.create'))$p$;

  execute 'drop policy if exists cr_update on public.call_requests';
  execute $p$create policy cr_update on public.call_requests for update
    using (public.has_perm('calls.create') or public.has_perm('pending.register') or created_by = auth.uid())
    with check (public.has_perm('calls.create') or public.has_perm('pending.register') or created_by = auth.uid())$p$;
end $$;

-- ------------------------------------------------------------------------
-- 0012_call_state.sql
-- ------------------------------------------------------------------------

-- ===========================================================================
-- Call state, without re-deriving it on every read.
--
-- Deriving a call's state from its latest visit in a view is correct, but
-- reading it means scanning `reports` through that table's RLS — a correlated
-- subquery plus can_see_call() per report row. Measured on 11k calls / 17k
-- reports: ~37ms without RLS, >5s with it ("canceling statement due to
-- statement timeout").
--
-- The latest visit is now kept ON the call, maintained by a trigger on
-- `reports`. Reads touch `calls` only — the register already loads it, so the
-- state comes along for free, and Pending Calls is an indexed filter.
-- ===========================================================================

-- An earlier build of these views read the columns below, and one is recreated
-- with a different shape, so any existing pair goes first.
drop view if exists public.pending_calls;
drop view if exists public.call_state;

alter table public.calls
  add column if not exists last_status   text default '',
  add column if not exists last_visit_at timestamptz;

-- Derived, so it can never drift from the two columns above.
alter table public.calls drop column if exists open_state;
alter table public.calls add column open_state text
  generated always as (
    case
      when last_visit_at is null and coalesce(last_status, '') = '' then 'Unattended'
      when lower(coalesce(last_status, '')) like 'solved%'          then 'Solved'
      when lower(coalesce(last_status, '')) like '%unsolved%'       then 'Unsolved'
      else 'Report pending'
    end
  ) stored;

create index if not exists calls_open_idx on public.calls (open_state) where open_state <> 'Solved';

-- ---- keep it current -------------------------------------------------------
-- security definer: a visit by one engineer updates the call regardless of who
-- may write `calls`.
create or replace function public.sync_call_last_visit(p_ucn text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.calls c
     set last_status   = coalesce(r.call_status, ''),
         last_visit_at = r.visit_at
    from (
      select call_status, visit_at
        from public.reports
       where ucn = p_ucn
       order by visit_at desc nulls last, id desc
       limit 1
    ) r
   where c.ucn = p_ucn;

  if not found then  -- no visits left (or none matched): back to Unattended
    update public.calls set last_status = '', last_visit_at = null where ucn = p_ucn;
  end if;
end $$;

create or replace function public.reports_touch_call()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_call_last_visit(coalesce(new.ucn, old.ucn));
  if tg_op = 'UPDATE' and new.ucn is distinct from old.ucn then
    perform public.sync_call_last_visit(old.ucn);
  end if;
  return null;
end $$;

drop trigger if exists reports_touch_call on public.reports;
create trigger reports_touch_call after insert or update or delete on public.reports
  for each row execute function public.reports_touch_call();

-- ---- backfill --------------------------------------------------------------
update public.calls c
   set last_status   = coalesce(r.call_status, ''),
       last_visit_at = r.visit_at
  from (
    select distinct on (ucn) ucn, call_status, visit_at
      from public.reports
     order by ucn, visit_at desc nulls last, id desc
  ) r
 where r.ucn = c.ucn
   and (c.last_status is distinct from coalesce(r.call_status, '')
     or c.last_visit_at is distinct from r.visit_at);

-- ---- views, now trivial ----------------------------------------------------
-- `calls` already carries `state` (the geographic one), so the call's open
-- state stays `open_state` here too.
create view public.call_state as
  select ucn, last_status, last_visit_at, open_state as state from public.calls;

create view public.pending_calls as
  select * from public.calls where open_state <> 'Solved';

alter view public.call_state    set (security_invoker = on);
alter view public.pending_calls set (security_invoker = on);

grant select on public.call_state    to authenticated;
grant select on public.pending_calls to authenticated;

-- ------------------------------------------------------------------------
-- 0013_call_number.sql
-- ------------------------------------------------------------------------

-- ===========================================================================
-- Call Number.
--
--   • From a call registration request → the request's UniqueID
--     (REQID-Product-SerialNo), carried over when the Hotline registers it.
--   • Direct customer call (no request) → CLYY + a 5-digit running number,
--     e.g. CL2600001, continuing the existing series for that year
--     (the register already holds CL2300081, CL2300079, …).
--
-- It was a free-text field nobody filled, so a hand-created call could be
-- saved with a blank Call Number — and reports, spare requests, consumption
-- and feedback are all keyed by it.
-- ===========================================================================

create table if not exists public.call_number_seq (
  yy      text primary key,          -- two-digit year
  last_no integer not null default 0
);
alter table public.call_number_seq enable row level security;  -- only the definer function touches it

-- Next CL number for a year. The counter is seeded once, from the numbers
-- already in `calls` — so import historical CL numbers BEFORE this runs (or
-- delete that year's `call_number_seq` row afterwards to re-seed).
-- Next CL number for this year. The year's counter is seeded from the highest
-- CLYY##### already in `calls`, so it continues the series instead of
-- colliding with imported history.
create or replace function public.next_direct_call_number(p_yy text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_yy text := coalesce(nullif(p_yy, ''), to_char(current_date, 'YY'));
  v_no int;
begin
  insert into public.call_number_seq (yy, last_no)
  values (v_yy, coalesce((
    select max(substring(call_number from 5 for 5)::int)
      from public.calls
     where call_number ~ ('^CL' || v_yy || '[0-9]{5}')), 0))
  on conflict (yy) do nothing;

  update public.call_number_seq set last_no = last_no + 1
   where yy = v_yy
   returning last_no into v_no;

  return 'CL' || v_yy || lpad(v_no::text, 5, '0');
end $$;

-- Assign one when the call arrives without a Call Number. A call registered
-- from a request carries the request's UniqueID, so this only fires for direct
-- calls (and for any import row that has none).
create or replace function public.calls_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ucn is null or new.ucn = '' then
    new.ucn := public.next_ucn(new.call_type);
  end if;
  if coalesce(new.call_number, '') = '' then
    new.call_number := public.next_direct_call_number(to_char(coalesce(new.reg_date, current_date), 'YY'));
  end if;
  if new.reg_date is null then new.reg_date := current_date; end if;
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end $$;

drop trigger if exists calls_biu on public.calls;
create trigger calls_biu before insert on public.calls
  for each row execute function public.calls_before_insert();

-- Back-fill calls saved before this with no Call Number, each in its own year's
-- series (a call registered in 2025 gets a CL25 number, not a CL26 one).
do $$
declare r record;
begin
  for r in select id, reg_date from public.calls where coalesce(call_number, '') = '' order by id loop
    update public.calls
       set call_number = public.next_direct_call_number(to_char(coalesce(r.reg_date, current_date), 'YY'))
     where id = r.id;
  end loop;
end $$;

grant execute on function public.next_direct_call_number(text) to authenticated;

