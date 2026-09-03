-- ===========================================================================
-- The OR number is the spare register's key.
--
-- `spare_requests` has TWO unique columns: `uid` (the app's own WA-… id) and
-- `or_no`, unique since 0011. The import matched on `uid` and wrote the OR
-- number into both — which fails the moment a request with that OR number is
-- already here under a different uid:
--
--     duplicate key value violates unique constraint "spare_requests_or_no_idx"
--
-- and that is exactly the state an earlier import left, having keyed those
-- 4,081 rows on the sheet's own row id. One row in the way stops the file.
--
-- So match on what actually identifies a request in the source — the OR
-- number — and leave `uid` alone:
--
--   • `uid` is filled from the OR number when an insert does not carry one, so
--     the import need not send it at all and never fights the other index.
--   • A LINE finds its parent by OR number even when that request is held
--     under a different uid. Only a request that is in neither file gets a
--     stub, as 0084 intended.
--
-- Nothing is re-keyed: a uid already handed out stays as it is. It is internal,
-- and rewriting it would drag every line, dispatch and notification with it.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0017's assignment, plus the uid default. Both are BEFORE INSERT, so the
-- NOT NULL on uid is checked after this has run.
-- ---------------------------------------------------------------------------
create or replace function public.spare_requests_assign_or_no()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.or_req_date is null then
    new.or_req_date := current_date;
  end if;
  if new.or_no is null or trim(new.or_no) = '' then
    -- Numbered in the month the request is raised in.
    new.or_no := public.next_spare_or_no(new.or_req_date);
  end if;
  -- An import identifies a request by its OR number and has no uid to give.
  if new.uid is null or btrim(new.uid) = '' then
    new.uid := new.or_no;
  end if;
  return new;
end $$;

drop trigger if exists spare_requests_assign_or_no on public.spare_requests;
create trigger spare_requests_assign_or_no
  before insert on public.spare_requests
  for each row execute function public.spare_requests_assign_or_no();

-- ---------------------------------------------------------------------------
-- A line names its parent by OR number. Resolve that to the request's uid
-- before falling back to 0084's stub — otherwise a request that is present
-- under another uid gets a second copy, and the stub itself then breaks on
-- the or_no index.
-- ---------------------------------------------------------------------------
create or replace function public.spare_request_line_stub_parent()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  held text;
begin
  if btrim(coalesce(new.request_uid, '')) = '' then
    return new;                                   -- nothing to point at; the FK will say so
  end if;
  if exists (select 1 from public.spare_requests r where r.uid = new.request_uid) then
    return new;
  end if;
  -- Same request, different uid: point the line at the row that is already here.
  select r.uid into held from public.spare_requests r where r.or_no = new.request_uid limit 1;
  if held is not null then
    new.request_uid := held;
    return new;
  end if;
  -- Marked, not silent: a request that exists only because a line referred to it
  -- should be findable and fixable, not indistinguishable from a real one.
  insert into public.spare_requests (uid, or_no, req_type, status, remarks)
  values (new.request_uid, new.request_uid, 'Call Based', 'Imported',
          'Created from an imported spare line — the request header was not in the export.')
  on conflict (uid) do nothing;
  return new;
end $$;

drop trigger if exists spare_request_line_stub_parent on public.spare_request_lines;
create trigger spare_request_line_stub_parent before insert on public.spare_request_lines
  for each row execute function public.spare_request_line_stub_parent();
