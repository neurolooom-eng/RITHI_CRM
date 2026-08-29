-- ===========================================================================
-- Every spare gets its own ID: <OR number>-<RowNo>, e.g. OR-2608-0001-01.
--
-- The approval chain has been per-spare since 0016 — each line carries its own
-- RM decision, DC number and dispatch date, so two spares on one OR can be
-- dispatched days apart. What was missing is a stable identifier to quote for
-- one of them: the RM approves against it, Stores dispatches against it, and
-- it is what goes on the DC.
--
-- Derived from the OR number and the row's position, so it reads as the OR it
-- belongs to. Assigned once and then fixed, and unique across the register.
-- ===========================================================================

alter table public.spare_request_lines
  add column if not exists line_uid text;

-- Two digits is enough: a request carries at most 20 parts (0011).
create or replace function public.spare_line_uid(p_or_no text, p_row_no int)
returns text language sql immutable as $$
  select case
           when coalesce(trim(p_or_no), '') = '' or p_row_no is null then null
           else trim(p_or_no) || '-' || lpad(p_row_no::text, 2, '0')
         end;
$$;
grant execute on function public.spare_line_uid(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Assigned on insert. The trigger name puts it after
-- spare_request_lines_assign_row_no (which sets row_no) and before
-- spare_request_lines_set_stage — BEFORE triggers fire in name order.
-- ---------------------------------------------------------------------------
create or replace function public.spare_request_lines_set_line_uid()
returns trigger language plpgsql security definer set search_path = public as $$
declare or_no text;
begin
  if new.line_uid is null or trim(new.line_uid) = '' then
    select r.or_no into or_no from public.spare_requests r where r.uid = new.request_uid;
    -- Requests imported before 0011 have no OR number; fall back to the UID so
    -- every line still has something unique to quote.
    new.line_uid := coalesce(public.spare_line_uid(or_no, new.row_no),
                             new.request_uid || '-' || lpad(coalesce(new.row_no, 1)::text, 2, '0'));
  end if;
  return new;
end $$;

drop trigger if exists spare_request_lines_line_uid on public.spare_request_lines;
create trigger spare_request_lines_line_uid
  before insert on public.spare_request_lines
  for each row execute function public.spare_request_lines_set_line_uid();

-- ---------------------------------------------------------------------------
-- Backfill. The RBAC guard is dropped around it: this is a data migration, and
-- in the SQL Editor auth.uid() is NULL so is_admin() is false and the guard
-- would judge it as an ordinary edit. Recreated after, which also makes this
-- migration safe to re-run.
-- ---------------------------------------------------------------------------
drop trigger if exists spare_request_lines_guard on public.spare_request_lines;

update public.spare_request_lines l
   set line_uid = coalesce(public.spare_line_uid(r.or_no, l.row_no),
                           l.request_uid || '-' || lpad(coalesce(l.row_no, 1)::text, 2, '0'))
  from public.spare_requests r
 where r.uid = l.request_uid
   and coalesce(l.line_uid, '') = '';

create trigger spare_request_lines_guard
  before update on public.spare_request_lines
  for each row execute function public.spare_request_lines_guard();

create unique index if not exists spare_request_lines_line_uid_idx
  on public.spare_request_lines (line_uid);

-- The ID is quoted on the DC and in the approval trail, so it is fixed once
-- assigned — like the OR number it derives from.
create or replace function public.spare_request_lines_uid_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  if new.line_uid is distinct from old.line_uid then
    raise exception 'The spare ID is assigned once and cannot be changed';
  end if;
  if new.row_no is distinct from old.row_no then
    raise exception 'The spare row number is assigned once and cannot be changed';
  end if;
  return new;
end $$;

drop trigger if exists spare_request_lines_uid_immutable on public.spare_request_lines;
create trigger spare_request_lines_uid_immutable
  before update on public.spare_request_lines
  for each row execute function public.spare_request_lines_uid_immutable();
