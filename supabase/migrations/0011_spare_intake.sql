-- ===========================================================================
-- Spare request intake — the register's own numbering and dates.
--   • OR NO: a running number per request, starting at OR47042.
--   • RowNo: the part's position within its request, restarting at 1 per OR.
--   • OR Req Date: today's date; TimeStamp is the existing created_at.
--   • Qty is at least 1, and a request carries at most 20 parts.
-- ===========================================================================

alter table public.spare_requests
  add column if not exists or_no       text,
  add column if not exists or_req_date date;

alter table public.spare_request_lines
  add column if not exists row_no int;

create unique index if not exists spare_requests_or_no_idx on public.spare_requests (or_no);
create index if not exists spare_request_lines_request_uid_idx on public.spare_request_lines (request_uid);

-- ---------------------------------------------------------------------------
-- OR numbers continue the sheet's series, which had reached OR47042.
-- ---------------------------------------------------------------------------
create sequence if not exists public.spare_or_no_seq as bigint start with 47042 minvalue 47042;

-- If rows were already imported, start the sequence past the highest OR number
-- present so a re-run never hands out one that is taken.
do $$
declare hi bigint;
begin
  select max((regexp_replace(or_no, '\D', '', 'g'))::bigint) into hi
    from public.spare_requests where or_no ~ '^OR\d+$';
  if hi is not null and hi >= 47042 then
    perform setval('public.spare_or_no_seq', hi + 1, false);
  end if;
end $$;

create or replace function public.spare_requests_assign_or_no()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.or_no is null or trim(new.or_no) = '' then
    new.or_no := 'OR' || nextval('public.spare_or_no_seq');
  end if;
  if new.or_req_date is null then
    new.or_req_date := current_date;
  end if;
  return new;
end $$;

drop trigger if exists spare_requests_assign_or_no on public.spare_requests;
create trigger spare_requests_assign_or_no
  before insert on public.spare_requests
  for each row execute function public.spare_requests_assign_or_no();

-- The OR number and its date identify the request downstream (DC, stores,
-- Tally), so they are assigned once and then fixed.
create or replace function public.spare_requests_number_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  if new.or_no is distinct from old.or_no then
    raise exception 'The OR number is assigned once and cannot be changed';
  end if;
  if new.or_req_date is distinct from old.or_req_date then
    raise exception 'The OR request date is assigned once and cannot be changed';
  end if;
  return new;
end $$;

drop trigger if exists spare_requests_number_immutable on public.spare_requests;
create trigger spare_requests_number_immutable
  before update on public.spare_requests
  for each row execute function public.spare_requests_number_immutable();

-- ---------------------------------------------------------------------------
-- RowNo restarts at 1 for each OR, and a request carries at most 20 parts.
-- ---------------------------------------------------------------------------
create or replace function public.spare_request_lines_assign_row_no()
returns trigger language plpgsql security definer set search_path = public as $$
declare next_no int;
begin
  if coalesce(new.qty, 0) < 1 then
    raise exception 'Quantity must be at least 1';
  end if;
  if new.row_no is null then
    select coalesce(max(row_no), 0) + 1 into next_no
      from public.spare_request_lines where request_uid = new.request_uid;
    new.row_no := next_no;
  end if;
  if new.row_no > 20 then
    raise exception 'A spare request may carry at most 20 parts';
  end if;
  return new;
end $$;

drop trigger if exists spare_request_lines_assign_row_no on public.spare_request_lines;
create trigger spare_request_lines_assign_row_no
  before insert on public.spare_request_lines
  for each row execute function public.spare_request_lines_assign_row_no();

-- Backfill anything already loaded, so old rows sort alongside new ones.
update public.spare_requests
   set or_req_date = created_at::date
 where or_req_date is null;

with numbered as (
  select id, row_number() over (partition by request_uid order by id) as rn
    from public.spare_request_lines where row_no is null
)
update public.spare_request_lines l
   set row_no = numbered.rn
  from numbered where numbered.id = l.id;

-- ---------------------------------------------------------------------------
-- A request is its parts: if the lines fail to insert, the client deletes the
-- header it just created rather than leaving a partial record (and a burnt OR
-- number) behind. No DELETE policy existed, so that cleanup silently did
-- nothing. Allow it only while the approval chain has not touched the request.
-- ---------------------------------------------------------------------------
drop policy if exists sr_delete on public.spare_requests;
create policy sr_delete on public.spare_requests for delete
  using (
    (public.is_admin() or public.is_spare_requester(spare_requests))
    and coalesce(stage, 'RM Approval') = 'RM Approval'
    and coalesce(rm_approval, 'Pending') = 'Pending'
    and received_at is null
  );
