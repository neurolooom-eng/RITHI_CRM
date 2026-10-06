-- ===========================================================================
-- 0398 — A CALL REQUEST'S ATTENDED DATE IS NOT IN THE FUTURE
--        (second re-review D-030, part 3)
--
-- The Attended Date on Request Registration had no upper bound, and it becomes
-- the complaint date of the call registered from the request -- so a call
-- could be dated days ahead, and every age and SLA measured from it starts in
-- the future. The form now stops at today; the database refuses the same for a
-- signed-in write, measured in India time (the day the engineer is living in,
-- not UTC's, which is still yesterday until 05:30).
-- On UPDATE only when attended_date itself changes, so a request recorded
-- before this is never refused for an unrelated edit.
-- Not stopped: an import (bulk.upload / import.panel), a connection with no
-- session, and a function running as its owner.
-- In the call_requests module, before the cr_read tail (0164).
-- ===========================================================================

create or replace function public.call_request_attended_not_future()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if current_user <> 'authenticated' then return new; end if;
  if public.has_perm('bulk.upload') or public.has_perm('import.panel') then return new; end if;
  if new.attended_date is null then return new; end if;
  if tg_op = 'UPDATE' and new.attended_date is not distinct from old.attended_date then return new; end if;
  if new.attended_date > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'The Attended Date cannot be in the future (%)', to_char(new.attended_date, 'DD-Mon-YYYY')
      using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.call_request_attended_not_future() from public, anon, authenticated;
drop trigger if exists call_request_attended_not_future on public.call_requests;
create trigger call_request_attended_not_future
  before insert or update of attended_date on public.call_requests
  for each row execute function public.call_request_attended_not_future();
